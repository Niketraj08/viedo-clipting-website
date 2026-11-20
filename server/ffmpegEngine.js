import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function runProcess(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const cleaned = stderr
            .split('\n')
            .filter((line) => !/^\s*(configuration:|lib(av|sw|post)|built with|ffmpeg version)/i.test(line))
            .join('\n')
            .trim();
          reject(new Error(`${cmd} exited with code ${code}: ${(cleaned || stderr).slice(-600)}`));
        }
      }
    });
  });
}

export async function probeVideo(filePath) {
  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const data = JSON.parse(stdout || '{}');
  const videoStream = (data.streams || []).find((s) => s.codec_type === 'video');
  const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio');
  if (!videoStream) {
    throw new Error('No video stream found in media file');
  }

  let fps = 30;
  if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    if (den > 0) fps = Math.round((num / den) * 100) / 100;
  }

  const duration = Number(data.format?.duration || videoStream.duration || 0);
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : 30,
    width: Number(videoStream.width) || 1280,
    height: Number(videoStream.height) || 720,
    fps,
    codec: videoStream.codec_name || 'h264',
    hasAudio: Boolean(audioStream),
  };
}

export async function extractThumbnail(filePath, timeSec, outPath) {
  const safeTime = Math.max(0.1, Number(timeSec) || 0.5);
  await runProcess('ffmpeg', [
    '-y',
    '-ss',
    safeTime.toFixed(2),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outPath,
  ]);
  return outPath;
}

export async function createAiAnalysisProxy(filePath, outPath) {
  await runProcess(
    'ffmpeg',
    [
      '-y',
      '-i',
      filePath,
      '-vf',
      'scale=640:-2,fps=10',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-ac',
      '1',
      outPath,
    ],
    180000
  );
  return outPath;
}

export async function downloadRemoteMedia(url, outPath) {
  await runProcess(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      '-i',
      url,
      '-t',
      '180',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outPath,
    ],
    240000
  );
  return outPath;
}

export async function captureHlsSegment(streamUrl, durationSec, outPath) {
  await runProcess(
    'ffmpeg',
    [
      '-y',
      '-live_start_index',
      '-1',
      '-i',
      streamUrl,
      '-t',
      String(durationSec),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outPath,
    ],
    90000
  );
  return outPath;
}

export async function ensureBackgroundMusicTrack(trackId, musicDir) {
  if (!trackId || trackId === 'none') return null;
  const tracks = {
    synth_pulse: {
      filename: 'synth_pulse.wav',
      expr: '0.18*sin(2*PI*110*t)*(0.5+0.5*sin(2*PI*2*t))+0.12*sin(2*PI*220*t)*exp(-3*mod(t,0.5))+0.08*sin(2*PI*330*t)*(0.5+0.5*cos(2*PI*1*t))',
    },
    lofi_chill: {
      filename: 'lofi_chill.wav',
      expr: '0.15*sin(2*PI*130.81*t)*exp(-1.5*mod(t,1))+0.12*sin(2*PI*196*t)*exp(-1.2*mod(t+0.5,1))+0.09*sin(2*PI*261.63*t)',
    },
    hype_bass: {
      filename: 'hype_bass.wav',
      expr: '0.22*sin(2*PI*55*t)*exp(-4*mod(t,0.25))+0.12*sin(2*PI*165*t)*exp(-3*mod(t+0.125,0.25))+0.07*sin(2*PI*440*t)*exp(-6*mod(t,0.5))',
    },
  };
  const spec = tracks[trackId] || tracks.synth_pulse;
  const fullPath = path.join(musicDir, spec.filename);
  if (fs.existsSync(fullPath)) return fullPath;

  await runProcess('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='${spec.expr}':s=44100:d=60`,
    '-af',
    'lowpass=f=1800,volume=0.6',
    fullPath,
  ]);
  return fullPath;
}

function formatAssTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatSrtTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function escapeAssText(text) {
  return String(text || '')
    .replace(/\\/g, '')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

const CAPTION_STYLES = {
  neon_pop: {
    baseColor: '&H00FFFFFF',
    activeColor: '&H00F7D052', // BGR gold/amber pop
    keywordColor: '&H00FF8AE2', // BGR neon violet
    outlineColor: '&H00120B1E',
    backColor: '&H9009090F',
    borderStyle: 1,
    outline: 5,
    shadow: 2,
    bold: -1,
  },
  hormozi_impact: {
    baseColor: '&H00FFFFFF',
    activeColor: '&H004ADE80', // BGR vivid emerald
    keywordColor: '&H0000D4FF', // BGR vivid yellow
    outlineColor: '&H00000000',
    backColor: '&H00000000',
    borderStyle: 1,
    outline: 6,
    shadow: 3,
    bold: -1,
  },
  bold_clean: {
    baseColor: '&H00F8FAFC',
    activeColor: '&H00FB923C', // BGR crisp sky/cobalt
    keywordColor: '&H00FACC15',
    outlineColor: '&H000F172A',
    backColor: '&H990F172A',
    borderStyle: 3,
    outline: 3,
    shadow: 0,
    bold: -1,
  },
  minimal_cinematic: {
    baseColor: '&H00E2E8F0',
    activeColor: '&H00FFFFFF',
    keywordColor: '&H00C4B5FD',
    outlineColor: '&H0009090F',
    backColor: '&H80000000',
    borderStyle: 1,
    outline: 3,
    shadow: 1,
    bold: 0,
  },
};

export function generateAssSubtitles({
  words = [],
  clipStart = 0,
  clipDuration = 30,
  styleId = 'neon_pop',
  language = 'english',
  width = 1080,
  height = 1920,
  layoutMode = 'smart_vertical',
  captionPosition = 'auto',
}) {
  const style = CAPTION_STYLES[styleId] || CAPTION_STYLES.neon_pop;
  const fontName = language === 'hindi' ? 'Noto Sans Devanagari' : 'Noto Sans';
  const fontSize = width >= 1900 ? 60 : Math.round(width * 0.056);

  let alignment = 2; // bottom center
  let marginV = Math.round(height * 0.14);

  if (captionPosition === 'top') {
    alignment = 8;
    marginV = Math.round(height * 0.08);
  } else if (captionPosition === 'middle') {
    alignment = 5;
    marginV = 0;
  } else if (captionPosition === 'bottom') {
    alignment = 2;
    marginV = Math.round(height * 0.12);
  } else if (layoutMode === 'split_screen' && height > width) {
    // Sit right over the seam / upper-gameplay safe area between top 40% facecam and bottom 60% gameplay
    alignment = 2;
    marginV = Math.round(height * 0.52);
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${style.baseColor},${style.activeColor},${style.outlineColor},${style.backColor},${style.bold},0,0,0,100,100,0,0,${style.borderStyle},${style.outline},${style.shadow},${alignment},64,64,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const normalizedWords = (words || [])
    .map((w) => {
      const start = Math.max(0, Number(w.start) - clipStart);
      const end = Math.min(clipDuration, Number(w.end) - clipStart);
      return {
        word: escapeAssText(w.word),
        start,
        end: Math.max(start + 0.12, end),
        highlight: Boolean(w.highlight),
      };
    })
    .filter((w) => w.word && w.start < clipDuration && w.end > 0);

  // Group into chunks of 3 words max for fast-paced short-form readability
  const chunks = [];
  for (let i = 0; i < normalizedWords.length; i += 3) {
    chunks.push(normalizedWords.slice(i, i + 3));
  }

  const events = [];
  for (const chunk of chunks) {
    for (let activeIdx = 0; activeIdx < chunk.length; activeIdx++) {
      const w = chunk[activeIdx];
      const lineStart = formatAssTime(w.start);
      const nextWord = chunk[activeIdx + 1];
      const lineEnd = formatAssTime(
        nextWord ? Math.max(w.end, nextWord.start) : w.end
      );

      const renderedTokens = chunk.map((token, idx) => {
        if (idx === activeIdx) {
          const color = token.highlight ? style.keywordColor : style.activeColor;
          return `{\\c${color}\\fscx110\\fscy110}${token.word}{\\c${style.baseColor}\\fscx100\\fscy100}`;
        }
        if (token.highlight) {
          return `{\\c${style.keywordColor}}${token.word}{\\c${style.baseColor}}`;
        }
        return token.word;
      });

      events.push(`Dialogue: 0,${lineStart},${lineEnd},Default,,0,0,0,,${renderedTokens.join(' ')}`);
    }
  }

  return header + events.join('\n') + '\n';
}

export function generateSrtSubtitles(words = [], clipStart = 0, clipDuration = 30) {
  const normalizedWords = (words || [])
    .map((w) => {
      const start = Math.max(0, Number(w.start) - clipStart);
      const end = Math.min(clipDuration, Number(w.end) - clipStart);
      return {
        word: String(w.word || '').trim(),
        start,
        end: Math.max(start + 0.12, end),
      };
    })
    .filter((w) => w.word && w.start < clipDuration && w.end > 0);

  const chunks = [];
  for (let i = 0; i < normalizedWords.length; i += 4) {
    chunks.push(normalizedWords.slice(i, i + 4));
  }

  return chunks
    .map((chunk, idx) => {
      const startStr = formatSrtTime(chunk[0].start);
      const endStr = formatSrtTime(chunk[chunk.length - 1].end);
      const text = chunk.map((c) => c.word).join(' ');
      return `${idx + 1}\n${startStr} --> ${endStr}\n${text}\n`;
    })
    .join('\n');
}

function clampBox(box, srcW, srcH, fallback) {
  const b = box || fallback;
  const nx = Math.max(0, Math.min(0.85, Number(b.x ?? fallback.x)));
  const ny = Math.max(0, Math.min(0.85, Number(b.y ?? fallback.y)));
  const nw = Math.max(0.15, Math.min(1 - nx, Number(b.w ?? fallback.w)));
  const nh = Math.max(0.15, Math.min(1 - ny, Number(b.h ?? fallback.h)));

  const px = Math.floor((nx * srcW) / 2) * 2;
  const py = Math.floor((ny * srcH) / 2) * 2;
  const pw = Math.max(64, Math.floor((nw * srcW) / 2) * 2);
  const ph = Math.max(64, Math.floor((nh * srcH) / 2) * 2);

  return {
    x: Math.min(px, Math.max(0, srcW - 64)),
    y: Math.min(py, Math.max(0, srcH - 64)),
    w: Math.min(pw, srcW - Math.min(px, Math.max(0, srcW - 64))),
    h: Math.min(ph, srcH - Math.min(py, Math.max(0, srcH - 64))),
  };
}

export async function renderClip({
  sourcePath,
  outPath,
  assPath,
  sourceInfo,
  startTime,
  endTime,
  format = '9:16',
  layoutMode = 'smart_vertical',
  facecamBox,
  gameplayBox,
  speakerFocusX = 0.5,
  showCaptions = true,
  musicPath = null,
  voiceVolume = 1.0,
  musicVolume = 0.2,
  transitionFade = true,
}) {
  const duration = Math.max(3, Number(endTime) - Number(startTime));
  const safeStart = Math.max(0, Math.min(Number(startTime), Math.max(0, sourceInfo.duration - 3)));
  const srcW = sourceInfo.width || 1280;
  const srcH = sourceInfo.height || 720;

  let outW = 1080;
  let outH = 1920;
  if (format === '1:1') {
    outW = 1080;
    outH = 1080;
  } else if (format === '16:9') {
    outW = 1920;
    outH = 1080;
  }

  let videoFilter = '';
  const escapedAss = assPath ? assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'") : '';

  if (format === '9:16' && layoutMode === 'split_screen') {
    const fc = clampBox(facecamBox, srcW, srcH, { x: 0.02, y: 0.04, w: 0.32, h: 0.38 });
    const gp = clampBox(gameplayBox, srcW, srcH, { x: 0.15, y: 0.1, w: 0.78, h: 0.85 });
    const topH = 768;
    const botH = 1152;
    videoFilter =
      `[0:v]crop=${fc.w}:${fc.h}:${fc.x}:${fc.y},scale=${outW}:${topH}:force_original_aspect_ratio=increase,crop=${outW}:${topH},setsar=1[top];` +
      `[0:v]crop=${gp.w}:${gp.h}:${gp.x}:${gp.y},scale=${outW}:${botH}:force_original_aspect_ratio=increase,crop=${outW}:${botH},setsar=1[bot];` +
      `[top][bot]vstack=inputs=2`;
  } else if (format === '9:16') {
    const focusX = Math.max(0.15, Math.min(0.85, Number(speakerFocusX) || 0.5));
    const targetCropW = Math.min(srcW, Math.floor((srcH * (9 / 16)) / 2) * 2);
    const maxCropX = Math.max(0, srcW - targetCropW);
    const cropX = Math.max(0, Math.min(maxCropX, Math.floor((focusX * srcW - targetCropW / 2) / 2) * 2));
    videoFilter = `[0:v]crop=${targetCropW}:${srcH}:${cropX}:0,scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1`;
  } else if (format === '1:1') {
    const side = Math.min(srcW, srcH);
    const focusX = Math.max(0.15, Math.min(0.85, Number(speakerFocusX) || 0.5));
    const maxCropX = Math.max(0, srcW - side);
    const cropX = Math.max(0, Math.min(maxCropX, Math.floor((focusX * srcW - side / 2) / 2) * 2));
    videoFilter = `[0:v]crop=${side}:${side}:${cropX}:0,scale=${outW}:${outH},setsar=1`;
  } else {
    videoFilter = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=#09090F,setsar=1`;
  }

  if (showCaptions && escapedAss) {
    videoFilter += `,ass='${escapedAss}'`;
  }
  if (transitionFade && duration > 2) {
    const fadeOutAt = Math.max(0.5, duration - 0.35).toFixed(2);
    videoFilter += `,fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOutAt}:d=0.35`;
  }
  videoFilter += '[vout]';

  const args = [
    '-y',
    '-ss',
    safeStart.toFixed(2),
    '-t',
    duration.toFixed(2),
    '-i',
    sourcePath,
  ];

  const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));
  if (hasMusic) {
    args.push('-stream_loop', '-1', '-i', musicPath);
  } else if (!sourceInfo.hasAudio) {
    args.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  }

  let audioFilter = '';
  const safeVoiceVol = Math.max(0, Math.min(2.0, Number(voiceVolume) || 1.0));
  const safeMusicVol = Math.max(0, Math.min(1.0, Number(musicVolume) || 0.2));

  if (sourceInfo.hasAudio && hasMusic) {
    audioFilter = `;[0:a]volume=${safeVoiceVol}[a0];[1:a]volume=${safeMusicVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
  } else if (sourceInfo.hasAudio) {
    audioFilter = `;[0:a]volume=${safeVoiceVol}`;
    if (transitionFade && duration > 2) {
      const fadeOutAt = Math.max(0.5, duration - 0.35).toFixed(2);
      audioFilter += `,afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOutAt}:d=0.3`;
    }
    audioFilter += '[aout]';
  } else if (hasMusic) {
    audioFilter = `;[1:a]volume=${safeMusicVol}[aout]`;
  } else {
    audioFilter = `;[1:a]anull[aout]`;
  }

  args.push(
    '-filter_complex',
    videoFilter + audioFilter,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    outPath
  );

  await runProcess('ffmpeg', args, 240000);
  return outPath;
}

export async function generateSampleStudioVideo(outPath, wavAudioPath) {
  // Creates a genuine 1280x720 30fps split-layout VOD (top-left streamer facecam + full-frame gaming/arena backdrop)
  // muxed with real spoken Gemini TTS audio.
  const audioInfo = await runProcess('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    wavAudioPath,
  ]);
  const parsed = JSON.parse(audioInfo.stdout || '{}');
  const dur = Math.min(45, Math.max(18, Number(parsed.format?.duration || 26)));

  const filter =
    `testsrc2=s=1280x720:r=30:d=${dur},hue=h='t*36',eq=brightness=-0.12:saturation=1.2[arena];` +
    `[arena]drawbox=x=30:y=30:w=360:h=240:color=#12131F@0.95:t=fill,` +
    `drawbox=x=30:y=30:w=360:h=240:color=#7C3AED:t=4,` +
    `drawbox=x=155:y=78:w=110:h=110:color=#38BDF8@0.9:t=fill,` +
    `drawbox=x=125:y=192:w=170:h=68:color=#4F46E5@0.95:t=fill,` +
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='FACECAM LIVE':x=50:y=46:fontsize=20:fontcolor=white,` +
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='RANKED ARENA - CLUTCH MATCH':x=430:y=46:fontsize=26:fontcolor=#E2E8F0,` +
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='SCORE 14 - 13 | OVERTIME':x=430:y=650:fontsize=28:fontcolor=#FACC15[vout]`;

  await runProcess('ffmpeg', [
    '-y',
    '-i',
    wavAudioPath,
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-map',
    '0:a',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    outPath,
  ]);
  return outPath;
}

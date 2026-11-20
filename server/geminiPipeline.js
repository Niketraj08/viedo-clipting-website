import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import fs from 'fs';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function waitForFileActive(ai, fileName, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fileInfo = await ai.files.get({ name: fileName });
    if (fileInfo.state === 'ACTIVE') return fileInfo;
    if (fileInfo.state === 'FAILED') {
      throw new Error('Gemini File API failed to process uploaded video.');
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Timed out waiting for Gemini File API to index video.');
}

async function withGeminiRetry(fn, { maxRetries = 4, timeoutMs = 75000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        fn(attempt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || '');
      const status = err?.status || err?.code;
      const isTransient =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        /"code":\s*(429|500|502|503|504)/.test(msg) ||
        /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timed out|ECONNRESET/i.test(msg);

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = Math.min(8000, 1000 * attempt);
      console.log(`[Gemini] Attempt ${attempt}/${maxRetries} hit transient availability (${status || 'retryable'}); switching/retrying in ${delayMs}ms...`);
      await onRetry?.(attempt + 1, maxRetries, delayMs);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contentType: {
      type: Type.STRING,
      description: 'Detected video genre: gaming, podcast, interview, reaction, or educational',
    },
    videoSummary: {
      type: Type.STRING,
      description: 'Concise 2-sentence summary of the video content',
    },
    hasFacecamOverlay: {
      type: Type.BOOLEAN,
      description: 'True if there is a picture-in-picture facecam / streamer webcam overlay over gameplay or screen',
    },
    facecamRegion: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
        w: { type: Type.NUMBER },
        h: { type: Type.NUMBER },
      },
      required: ['x', 'y', 'w', 'h'],
    },
    gameplayRegion: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
        w: { type: Type.NUMBER },
        h: { type: Type.NUMBER },
      },
      required: ['x', 'y', 'w', 'h'],
    },
    highlights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          description: { type: Type.STRING },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          viralScore: { type: Type.INTEGER },
          viralReason: { type: Type.STRING },
          startTime: { type: Type.NUMBER },
          endTime: { type: Type.NUMBER },
          recommendedLayout: {
            type: Type.STRING,
            description: 'split_screen, active_speaker, or smart_vertical',
          },
          speakerFocusX: {
            type: Type.NUMBER,
            description: 'Normalized horizontal center (0.15 to 0.85) of the active speaker or main subject',
          },
          transcriptWords: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                highlight: { type: Type.BOOLEAN },
              },
              required: ['word', 'start', 'end', 'highlight'],
            },
          },
        },
        required: [
          'title',
          'hook',
          'description',
          'hashtags',
          'viralScore',
          'viralReason',
          'startTime',
          'endTime',
          'recommendedLayout',
          'speakerFocusX',
          'transcriptWords',
        ],
      },
    },
  },
  required: [
    'contentType',
    'videoSummary',
    'hasFacecamOverlay',
    'facecamRegion',
    'gameplayRegion',
    'highlights',
  ],
};

export async function analyzeVideoWithGemini({
  videoPath,
  mimeType = 'video/mp4',
  duration = 30,
  width = 1280,
  height = 720,
  targetLanguage = 'english',
  layoutPreference = 'auto',
  clipCount = 3,
  onStatus,
}) {
  const ai = getAiClient();
  let uploadedFile = null;

  try {
    const stat = await fs.promises.stat(videoPath);
    const t0 = Date.now();
    await onStatus?.(30, 'Uploading video to Gemini Files API');
    uploadedFile = await ai.files.upload({
      file: videoPath,
      config: { mimeType },
    });
    await onStatus?.(36, 'Waiting for Gemini video indexing');
    const activeFile = await waitForFileActive(ai, uploadedFile.name);
    const mediaPart = {
      fileData: {
        fileUri: activeFile.uri,
        mimeType: activeFile.mimeType || mimeType,
      },
    };

    await onStatus?.(42, 'Gemini AI watching video & detecting highlights, facecam, and captions');
    console.log(`[Gemini] Starting highlight analysis (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${duration.toFixed(1)}s)`);
    const maxClipLen = Math.min(45, Math.max(8, Math.floor(duration)));
    const targetClips = duration < 24 ? Math.min(2, clipCount) : clipCount;
    const langInstruction =
      targetLanguage === 'hindi'
        ? 'Hindi in Devanagari script'
        : targetLanguage === 'hinglish'
        ? 'conversational Hinglish (Romanized Hindi + English mix)'
        : 'punchy natural English';

    const prompt = `Watch and listen carefully to this video (duration: ${duration.toFixed(1)}s, resolution: ${width}x${height}).
1. Classify contentType ("gaming", "podcast", "interview", "reaction", or "educational").
2. Detect facecamRegion {x, y, w, h} and gameplayRegion {x, y, w, h} normalized 0..1.
3. Extract the ${targetClips} best viral clips with startTime >= 0 and endTime <= ${duration.toFixed(2)} (each 6-${maxClipLen}s). Layout preference: "${layoutPreference}".
4. For each clip, produce transcriptWords in ${langInstruction} with exact absolute timestamps [start, end] and highlight: true on key punchy words.
5. Generate title, hook, description, 5 hashtags, viralScore (65-99), and viralReason.`;

    const response = await withGeminiRetry(
      (attempt) => {
        const model = attempt >= 2 ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
        return ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [mediaPart, { text: prompt }],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: attempt >= 2 ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: ANALYSIS_SCHEMA,
          },
        });
      },
      {
        maxRetries: 4,
        timeoutMs: 75000,
        onRetry: async (nextAttempt, max) => {
          await onStatus?.(45, `Gemini AI busy — retrying video analysis (attempt ${nextAttempt}/${max})`);
        },
      }
    );

    console.log(`[Gemini] Completed highlight analysis in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const parsed = JSON.parse(response.text || '{}');
    if (Array.isArray(parsed.highlights)) {
      parsed.highlights = parsed.highlights.map((h) => ({
        ...h,
        transcripts: {
          english: targetLanguage === 'english' ? h.transcriptWords || [] : [],
          hindi: targetLanguage === 'hindi' ? h.transcriptWords || [] : [],
          hinglish: targetLanguage === 'hinglish' ? h.transcriptWords || [] : [],
        },
      }));
    }
    return parsed;
  } finally {
    if (uploadedFile?.name) {
      ai.files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
}

export async function regenerateCaptionsWithGemini({ words, targetLanguage, clipContext }) {
  const ai = getAiClient();
  const prompt = `Convert and refine these timestamped captions into "${targetLanguage}" (${
    targetLanguage === 'hindi'
      ? 'Hindi in Devanagari script'
      : targetLanguage === 'hinglish'
      ? 'conversational Hinglish using Roman script'
      : 'punchy natural English'
  }).
Preserve the overall start and end time boundaries cleanly and mark impactful keywords with highlight: true.
Clip context: ${clipContext || 'Short-form creator clip'}
Source words: ${JSON.stringify(words)}`;

  const response = await withGeminiRetry((attempt) =>
    ai.models.generateContent({
      model: attempt >= 2 ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              start: { type: Type.NUMBER },
              end: { type: Type.NUMBER },
              highlight: { type: Type.BOOLEAN },
            },
            required: ['word', 'start', 'end', 'highlight'],
          },
        },
      },
    })
  );

  return JSON.parse(response.text || '[]');
}

export async function analyzeLivestreamSegmentWithGemini({ segmentPath, duration = 15 }) {
  const ai = getAiClient();
  let uploadedFile = null;

  try {
    uploadedFile = await ai.files.upload({
      file: segmentPath,
      config: { mimeType: 'video/mp4' },
    });
    const activeFile = await waitForFileActive(ai, uploadedFile.name, 90000);
    const mediaPart = {
      fileData: {
        fileUri: activeFile.uri,
        mimeType: activeFile.mimeType || 'video/mp4',
      },
    };

    const response = await withGeminiRetry((attempt) =>
      ai.models.generateContent({
        model: attempt >= 2 ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              mediaPart,
              {
                text: `Analyze this ${duration.toFixed(1)}s livestream segment. Determine if it has an engaging/exciting moment worth clipping (isHighlight: true/false, viralScore 0-100). Detect facecamRegion and gameplayRegion (normalized 0..1), generate title, hook, hashtags, and word-level transcripts in english, hindi, and hinglish within [0, ${duration.toFixed(1)}].`,
              },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: attempt >= 2 ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isHighlight: { type: Type.BOOLEAN },
              viralScore: { type: Type.INTEGER },
              title: { type: Type.STRING },
              hook: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedLayout: { type: Type.STRING },
              facecamRegion: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                },
                required: ['x', 'y', 'w', 'h'],
              },
              gameplayRegion: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                },
                required: ['x', 'y', 'w', 'h'],
              },
              transcripts: {
                type: Type.OBJECT,
                properties: {
                  english: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        highlight: { type: Type.BOOLEAN },
                      },
                      required: ['word', 'start', 'end', 'highlight'],
                    },
                  },
                  hindi: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        highlight: { type: Type.BOOLEAN },
                      },
                      required: ['word', 'start', 'end', 'highlight'],
                    },
                  },
                  hinglish: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        highlight: { type: Type.BOOLEAN },
                      },
                      required: ['word', 'start', 'end', 'highlight'],
                    },
                  },
                },
                required: ['english', 'hindi', 'hinglish'],
              },
            },
            required: [
              'isHighlight',
              'viralScore',
              'title',
              'hook',
              'hashtags',
              'recommendedLayout',
              'facecamRegion',
              'gameplayRegion',
              'transcripts',
            ],
          },
        },
      })
    );

    return JSON.parse(response.text || '{}');
  } finally {
    if (uploadedFile?.name) {
      ai.files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
}

export async function generateSampleSpeechWav(wavOutPath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }

  const script =
    'Wait wait wait, watch this final overtime round right here! Nobody thought we could clutch a one versus three with zero shields left. If I hit this flick shot right now, chat is going completely crazy. Boom! That is why you never give up before the final buzzer. Drop a like if you saw that reaction!';

  const attempts = [
    {
      version: 'v1alpha',
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ role: 'user', parts: [{ text: script }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
    },
    {
      version: 'v1beta',
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ role: 'user', parts: [{ text: `Say excitedly: ${script}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
    },
    {
      version: 'v1beta',
      model: 'gemini-3.8-flash-lite-tts',
      contents: `Say excitedly: ${script}`,
      config: { responseModalities: ['AUDIO'] },
    },
  ];

  for (const attempt of attempts) {
    try {
      const client = new GoogleGenAI({
        apiKey,
        apiVersion: attempt.version,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await client.models.generateContent({
        model: attempt.model,
        contents: attempt.contents,
        config: attempt.config,
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await fs.promises.writeFile(wavOutPath, Buffer.from(base64Audio, 'base64'));
        return wavOutPath;
      }
    } catch (err) {
      console.warn(`TTS attempt (${attempt.model} / ${attempt.version}) skipped:`, err.message);
    }
  }

  // Fallback: synthesize clean 24s stereo ambient audio WAV via FFmpeg if TTS audio modality is restricted
  const { spawn } = await import('child_process');
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      "aevalsrc='0.2*sin(2*PI*220*t)*exp(-2*mod(t,0.5))+0.15*sin(2*PI*330*t)':s=24000:d=24",
      wavOutPath,
    ]);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('FFmpeg fallback audio generation failed'))
    );
    child.on('error', reject);
  });
  return wavOutPath;
}

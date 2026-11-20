import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  adjustUserCredits,
  createClip,
  createLivestream,
  createProject,
  createUser,
  deleteClipById,
  deleteProjectById,
  ensureStorageDirs,
  findUserByEmail,
  findUserById,
  getClipById,
  getLivestreamById,
  getProjectById,
  getStoragePaths,
  listClipsByProject,
  listClipsByUser,
  listLivestreamsByUser,
  listProjectsByUser,
  listTransactionsByUser,
  sanitizeUser,
  updateClip,
  updateLivestream,
  updateProject,
  updateUser,
} from './server/db.js';
import {
  createAiAnalysisProxy,
  downloadRemoteMedia,
  ensureBackgroundMusicTrack,
  extractThumbnail,
  generateAssSubtitles,
  generateSampleStudioVideo,
  generateSrtSubtitles,
  probeVideo,
  renderClip,
} from './server/ffmpegEngine.js';
import {
  analyzeVideoWithGemini,
  generateSampleSpeechWav,
  regenerateCaptionsWithGemini,
} from './server/geminiPipeline.js';
import {
  processLiveSegmentFile,
  startHlsMonitorLoop,
  stopHlsMonitorLoop,
} from './server/livestreamEngine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'clipforge_dev_jwt_secret_key_change_in_prod';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);

ensureStorageDirs();
const storagePaths = getStoragePaths();

const sseClients = new Map();

function emitProjectEvent(channelId, payload) {
  const listeners = sseClients.get(channelId);
  if (!listeners) return;
  const serialized = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of listeners) {
    res.write(serialized);
  }
}

function registerSse(channelId, req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseClients.has(channelId)) {
    sseClients.set(channelId, new Set());
  }
  sseClients.get(channelId).add(res);

  req.on('close', () => {
    const set = sseClients.get(channelId);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseClients.delete(channelId);
    }
  });
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const queryToken = req.query?.token;
  const token = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(String(token), JWT_SECRET);
    const user = findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Account not found' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storagePaths.uploads),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4') || '.mp4';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

const segmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storagePaths.livestreams),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.webm') || '.webm';
    cb(null, `seg_${uuidv4()}${ext}`);
  },
});

const segmentUpload = multer({
  storage: segmentStorage,
  limits: { fileSize: 120 * 1024 * 1024 },
});

async function runProjectPipeline({ projectId, sourcePath, options }) {
  const project = getProjectById(projectId);
  if (!project) return;

  const updateStage = async (progress, stage, extra = {}) => {
    const updated = await updateProject(projectId, { progress, stage, ...extra });
    emitProjectEvent(projectId, { type: 'progress', project: updated });
    return updated;
  };

  try {
    await updateStage(12, 'Inspecting video & audio streams with FFprobe', {
      status: 'processing',
    });

    const sourceInfo = await probeVideo(sourcePath);
    const projectThumbPath = path.join(storagePaths.thumbs, `proj_${projectId}.jpg`);
    await extractThumbnail(sourcePath, Math.min(2, sourceInfo.duration / 2), projectThumbPath);

    await updateStage(25, 'Preparing optimized AI vision stream & analyzing highlights', {
      duration: sourceInfo.duration,
      resolution: `${sourceInfo.width}x${sourceInfo.height}`,
      thumbUrl: `/api/media/thumbs/proj_${projectId}.jpg`,
    });

    const proxyPath = path.join(storagePaths.uploads, `${projectId}_ai_proxy.mp4`);
    let analysisPath = sourcePath;
    try {
      await createAiAnalysisProxy(sourcePath, proxyPath);
      analysisPath = proxyPath;
    } catch {
      analysisPath = sourcePath;
    }

    let analysis;
    try {
      analysis = await analyzeVideoWithGemini({
        videoPath: analysisPath,
        mimeType: 'video/mp4',
        duration: sourceInfo.duration,
        width: sourceInfo.width,
        height: sourceInfo.height,
        targetLanguage: options.language || 'english',
        layoutPreference: options.layoutPreference || 'auto',
        clipCount: Number(options.clipCount || 3),
        onStatus: async (pct, msg) => {
          await updateStage(pct, msg);
        },
      });
    } finally {
      if (analysisPath === proxyPath && fs.existsSync(proxyPath)) {
        fs.unlink(proxyPath, () => {});
      }
    }

    await updateStage(55, 'Detected highlights, facecam & gameplay regions. Rendering clips...', {
      contentType: analysis.contentType || 'video',
      summary: analysis.videoSummary || '',
      hasFacecamOverlay: Boolean(analysis.hasFacecamOverlay),
      facecamRegion: analysis.facecamRegion,
      gameplayRegion: analysis.gameplayRegion,
    });

    const highlights = Array.isArray(analysis.highlights) ? analysis.highlights : [];
    if (highlights.length === 0) {
      throw new Error('AI analysis returned zero clippable segments for this media file.');
    }

    const musicTrack = options.musicTrack || 'none';
    const musicPath =
      musicTrack !== 'none'
        ? await ensureBackgroundMusicTrack(musicTrack, storagePaths.music)
        : null;

    const targetLanguage = options.language || 'english';
    const targetFormat = options.format || '9:16';
    const captionStyle = options.captionStyle || 'neon_pop';
    const createdClips = [];

    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const clipId = uuidv4();
      const startTime = Math.max(0, Math.min(Number(h.startTime) || 0, sourceInfo.duration - 4));
      const rawEnd = Number(h.endTime) || startTime + 15;
      const endTime = Math.min(sourceInfo.duration, Math.max(startTime + 4, rawEnd));
      const clipDuration = endTime - startTime;

      let layoutMode = h.recommendedLayout || 'smart_vertical';
      if (options.layoutPreference && options.layoutPreference !== 'auto') {
        layoutMode = options.layoutPreference;
      }

      const words = h.transcripts?.[targetLanguage] || h.transcripts?.english || [];
      const assPath = path.join(storagePaths.subs, `${clipId}.ass`);
      const outW = targetFormat === '16:9' ? 1920 : 1080;
      const outH = targetFormat === '9:16' ? 1920 : 1080;

      const assText = generateAssSubtitles({
        words,
        clipStart: startTime,
        clipDuration,
        styleId: captionStyle,
        language: targetLanguage,
        width: outW,
        height: outH,
        layoutMode,
      });
      await fs.promises.writeFile(assPath, assText, 'utf8');

      const outPath = path.join(storagePaths.clips, `${clipId}.mp4`);
      const thumbPath = path.join(storagePaths.thumbs, `${clipId}.jpg`);

      const stepProgress = 58 + Math.round(((i + 0.5) / highlights.length) * 38);
      await updateStage(
        stepProgress,
        `Rendering clip ${i + 1} of ${highlights.length}: ${h.title || 'Highlight'}`
      );

      await renderClip({
        sourcePath,
        outPath,
        assPath,
        sourceInfo,
        startTime,
        endTime,
        format: targetFormat,
        layoutMode,
        facecamBox: analysis.facecamRegion,
        gameplayBox: analysis.gameplayRegion,
        speakerFocusX: h.speakerFocusX ?? 0.5,
        showCaptions: true,
        musicPath,
        voiceVolume: 1.0,
        musicVolume: 0.18,
        transitionFade: true,
      });

      await extractThumbnail(outPath, Math.min(1.5, clipDuration / 2), thumbPath);

      const clip = await createClip({
        id: clipId,
        userId: project.userId,
        projectId,
        title: h.title || `Viral Moment #${i + 1}`,
        hook: h.hook || '',
        description: h.description || '',
        hashtags: Array.isArray(h.hashtags) ? h.hashtags : ['#shorts', '#viral'],
        viralScore: Number(h.viralScore) || 85,
        viralReason: h.viralReason || 'Strong pacing and emotional hook',
        startTime,
        endTime,
        duration: Number(clipDuration.toFixed(2)),
        format: targetFormat,
        layoutMode,
        language: targetLanguage,
        captionStyle,
        captionPosition: 'auto',
        showCaptions: true,
        musicTrack,
        voiceVolume: 1.0,
        musicVolume: 0.18,
        facecamBox: analysis.facecamRegion,
        gameplayBox: analysis.gameplayRegion,
        speakerFocusX: h.speakerFocusX ?? 0.5,
        transcripts: h.transcripts || { english: [], hindi: [], hinglish: [] },
        sourcePath,
        sourceInfo,
        outputPath: outPath,
        thumbPath,
        videoUrl: `/api/media/clips/${clipId}.mp4`,
        thumbUrl: `/api/media/thumbs/${clipId}.jpg`,
      });

      createdClips.push(clip);
      emitProjectEvent(projectId, { type: 'clip_ready', clip });
    }

    const creditCost = Math.max(5, createdClips.length * 4);
    await adjustUserCredits(
      project.userId,
      -creditCost,
      `Processed "${project.title}" (${createdClips.length} clips)`
    );

    const finishedProject = await updateStage(100, 'All clips rendered and ready', {
      status: 'completed',
      clipsCount: createdClips.length,
    });
    emitProjectEvent(projectId, {
      type: 'completed',
      project: finishedProject,
      clips: createdClips,
    });
  } catch (err) {
    console.error('Project pipeline error:', err);
    const failedProject = await updateProject(projectId, {
      status: 'failed',
      error: err.message || 'Video processing failed',
      stage: 'Processing failed',
    });
    emitProjectEvent(projectId, {
      type: 'error',
      project: failedProject,
      error: err.message || 'Video processing failed',
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/media/clips', express.static(storagePaths.clips));
  app.use('/api/media/thumbs', express.static(storagePaths.thumbs));
  app.use('/api/media/uploads', express.static(storagePaths.uploads));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  // Authentication Routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body || {};
      if (!email || !password || String(password).length < 6) {
        return res
          .status(400)
          .json({ error: 'Valid email and password (min 6 characters) are required.' });
      }
      const existing = findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      const passwordHash = await bcrypt.hash(String(password), 10);
      const user = await createUser({ name: name || 'Creator', email, passwordHash });
      const token = signToken(user);
      res.status(201).json({ token, user: sanitizeUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      const token = signToken(user);
      res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/demo', async (req, res) => {
    try {
      let user = findUserByEmail('creator@clipforge.ai');
      if (!user) {
        const passwordHash = await bcrypt.hash('demo_creator_pass', 10);
        user = await createUser({
          name: 'Alex Rivera',
          email: 'creator@clipforge.ai',
          passwordHash,
        });
      }
      const token = signToken(user);
      res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const transactions = listTransactionsByUser(req.user.id);
    res.json({ user: sanitizeUser(req.user), transactions });
  });

  app.patch('/api/auth/settings', requireAuth, async (req, res) => {
    try {
      const { name, settings } = req.body || {};
      const updated = await updateUser(req.user.id, {
        ...(name ? { name: String(name).trim() } : {}),
        ...(settings ? { settings } : {}),
      });
      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/billing/upgrade', requireAuth, async (req, res) => {
    try {
      const { plan } = req.body || {};
      const plans = {
        starter: { credits: 120, label: 'Starter Plan' },
        creator_pro: { credits: 600, label: 'Creator Pro Plan' },
        studio_live: { credits: 2500, label: 'Studio Live Plan' },
      };
      const target = plans[plan];
      if (!target) {
        return res.status(400).json({ error: 'Invalid plan selected.' });
      }
      await updateUser(req.user.id, { plan });
      const updated = await adjustUserCredits(
        req.user.id,
        target.credits,
        `Activated ${target.label} (+${target.credits} credits)`,
        'plan_upgrade'
      );
      const transactions = listTransactionsByUser(req.user.id);
      res.json({ user: sanitizeUser(updated), transactions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // URL Metadata Inspection
  app.post('/api/projects/lookup-url', requireAuth, async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Please enter a valid http(s) URL.' });
      }
      const isYouTube = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts|youtube\.com\/live)/i.test(
        url
      );
      if (isYouTube) {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const resp = await fetch(oembedUrl);
        if (!resp.ok) {
          return res.status(400).json({
            error: 'Could not retrieve YouTube video metadata. Check if the video is public.',
          });
        }
        const meta = await resp.json();
        return res.json({
          sourceType: 'youtube',
          directIngestSupported: false,
          title: meta.title,
          author: meta.author_name,
          thumbnailUrl: meta.thumbnail_url,
          notice:
            'YouTube metadata verified via oEmbed. Because direct third-party YouTube stream scraping is restricted, upload your MP4 source file or provide a direct MP4/HLS VOD URL to process with AI & FFmpeg.',
        });
      }

      const isDirectMedia = /\.(mp4|mov|webm|mkv|m3u8)(\?|$)/i.test(url);
      return res.json({
        sourceType: url.includes('.m3u8') ? 'hls_vod' : 'direct_url',
        directIngestSupported: true,
        title: decodeURIComponent(path.basename(new URL(url).pathname) || 'Remote Video Stream'),
        notice: isDirectMedia
          ? 'Direct media stream detected. Ready for FFmpeg ingestion & Gemini AI analysis.'
          : 'Remote URL ready. FFmpeg will attempt to ingest this stream.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload Video & Start AI Pipeline
  app.post(
    '/api/projects/process-upload',
    requireAuth,
    upload.single('video'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No video file uploaded.' });
        }
        if ((req.user.credits || 0) < 5) {
          return res.status(402).json({
            error: 'Insufficient credits (minimum 5 credits required). Upgrade your plan in Billing.',
          });
        }
        const projectId = uuidv4();
        const options = {
          language: req.body.language || req.user.settings?.defaultLanguage || 'english',
          format: req.body.format || req.user.settings?.defaultFormat || '9:16',
          layoutPreference: req.body.layoutPreference || 'auto',
          captionStyle: req.body.captionStyle || req.user.settings?.defaultCaptionStyle || 'neon_pop',
          musicTrack: req.body.musicTrack || 'none',
          clipCount: Number(req.body.clipCount || 3),
          mimeType: req.file.mimetype || 'video/mp4',
        };

        const project = await createProject({
          id: projectId,
          userId: req.user.id,
          title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ''),
          sourceType: 'upload',
          sourceFilename: req.file.originalname,
          sourcePath: req.file.path,
          options,
        });

        runProjectPipeline({ projectId, sourcePath: req.file.path, options });
        res.status(202).json({ project });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Process Direct Video / VOD URL
  app.post('/api/projects/process-url', requireAuth, async (req, res) => {
    try {
      const { url, title, language, format, layoutPreference, captionStyle, musicTrack, clipCount } =
        req.body || {};
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Valid direct MP4 or HLS URL is required.' });
      }
      if ((req.user.credits || 0) < 5) {
        return res.status(402).json({ error: 'Insufficient credits.' });
      }

      const projectId = uuidv4();
      const targetPath = path.join(storagePaths.uploads, `${projectId}.mp4`);
      const options = {
        language: language || 'english',
        format: format || '9:16',
        layoutPreference: layoutPreference || 'auto',
        captionStyle: captionStyle || 'neon_pop',
        musicTrack: musicTrack || 'none',
        clipCount: Number(clipCount || 3),
        mimeType: 'video/mp4',
      };

      const project = await createProject({
        id: projectId,
        userId: req.user.id,
        title: title || 'Remote Stream Clip Project',
        sourceType: 'direct_url',
        sourceUrl: url,
        sourcePath: targetPath,
        options,
      });

      (async () => {
        try {
          await updateProject(projectId, {
            status: 'processing',
            progress: 6,
            stage: 'Downloading / ingesting remote video stream via FFmpeg',
          });
          emitProjectEvent(projectId, {
            type: 'progress',
            project: getProjectById(projectId),
          });
          await downloadRemoteMedia(url, targetPath);
          await runProjectPipeline({ projectId, sourcePath: targetPath, options });
        } catch (err) {
          const failed = await updateProject(projectId, {
            status: 'failed',
            error: `Remote stream ingestion failed: ${err.message}`,
            stage: 'Stream ingestion failed',
          });
          emitProjectEvent(projectId, { type: 'error', project: failed, error: failed.error });
        }
      })();

      res.status(202).json({ project });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate Real Sample Studio VOD (Gemini TTS + FFmpeg Facecam/Gameplay Video) and Process
  app.post('/api/projects/sample', requireAuth, async (req, res) => {
    try {
      if ((req.user.credits || 0) < 5) {
        return res.status(402).json({ error: 'Insufficient credits.' });
      }
      const projectId = uuidv4();
      const wavPath = path.join(storagePaths.uploads, `${projectId}_speech.wav`);
      const mp4Path = path.join(storagePaths.uploads, `${projectId}_sample.mp4`);
      const options = {
        language: req.body?.language || req.user.settings?.defaultLanguage || 'english',
        format: req.body?.format || '9:16',
        layoutPreference: req.body?.layoutPreference || 'split_screen',
        captionStyle: req.body?.captionStyle || 'neon_pop',
        musicTrack: req.body?.musicTrack || 'synth_pulse',
        clipCount: 2,
        mimeType: 'video/mp4',
      };

      const project = await createProject({
        id: projectId,
        userId: req.user.id,
        title: 'Sample Gaming Clutch + Facecam VOD',
        sourceType: 'sample_studio',
        sourcePath: mp4Path,
        options,
      });

      (async () => {
        try {
          await updateProject(projectId, {
            status: 'processing',
            progress: 5,
            stage: 'Synthesizing real voiceover & split-layout studio VOD',
          });
          emitProjectEvent(projectId, { type: 'progress', project: getProjectById(projectId) });
          await generateSampleSpeechWav(wavPath);
          await generateSampleStudioVideo(mp4Path, wavPath);
          fs.unlink(wavPath, () => {});
          await runProjectPipeline({ projectId, sourcePath: mp4Path, options });
        } catch (err) {
          const failed = await updateProject(projectId, {
            status: 'failed',
            error: err.message,
            stage: 'Sample generation failed',
          });
          emitProjectEvent(projectId, { type: 'error', project: failed, error: err.message });
        }
      })();

      res.status(202).json({ project });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/projects', requireAuth, (req, res) => {
    const projects = listProjectsByUser(req.user.id);
    res.json({ projects });
  });

  app.get('/api/projects/:id', requireAuth, (req, res) => {
    const project = getProjectById(req.params.id);
    if (!project || project.userId !== req.user.id) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const clips = listClipsByProject(project.id);
    res.json({ project, clips });
  });

  app.get('/api/projects/:id/events', requireAuth, (req, res) => {
    const project = getProjectById(req.params.id);
    if (!project || project.userId !== req.user.id) {
      return res.status(404).json({ error: 'Project not found' });
    }
    registerSse(project.id, req, res);
    res.write(`data: ${JSON.stringify({ type: 'snapshot', project, clips: listClipsByProject(project.id) })}\n\n`);
  });

  app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    const deleted = await deleteProjectById(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    res.json({ deleted: true });
  });

  // Clips Routes
  app.get('/api/clips', requireAuth, (req, res) => {
    const clips = listClipsByUser(req.user.id);
    res.json({ clips });
  });

  app.patch('/api/clips/:id', requireAuth, async (req, res) => {
    const clip = getClipById(req.params.id);
    if (!clip || clip.userId !== req.user.id) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    const allowed = [
      'title',
      'hook',
      'description',
      'hashtags',
      'startTime',
      'endTime',
      'format',
      'layoutMode',
      'language',
      'captionStyle',
      'captionPosition',
      'showCaptions',
      'musicTrack',
      'voiceVolume',
      'musicVolume',
      'facecamBox',
      'gameplayBox',
      'speakerFocusX',
      'transcripts',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.startTime !== undefined && patch.endTime !== undefined) {
      patch.duration = Number(Math.max(2, Number(patch.endTime) - Number(patch.startTime)).toFixed(2));
    }
    const updated = await updateClip(clip.id, patch);
    res.json({ clip: updated });
  });

  app.post('/api/clips/:id/regenerate-captions', requireAuth, async (req, res) => {
    try {
      const clip = getClipById(req.params.id);
      if (!clip || clip.userId !== req.user.id) {
        return res.status(404).json({ error: 'Clip not found' });
      }
      const targetLanguage = req.body?.language || clip.language || 'english';
      const baseWords =
        (clip.transcripts?.english?.length && clip.transcripts.english) ||
        (clip.transcripts?.[clip.language]?.length && clip.transcripts[clip.language]) ||
        Object.values(clip.transcripts || {}).find((arr) => Array.isArray(arr) && arr.length > 0) ||
        [];
      if (baseWords.length === 0) {
        return res.status(400).json({ error: 'No source transcript words available to regenerate.' });
      }
      const regenerated = await regenerateCaptionsWithGemini({
        words: baseWords,
        targetLanguage,
        clipContext: `${clip.title} - ${clip.hook}`,
      });
      const nextTranscripts = {
        ...(clip.transcripts || {}),
        [targetLanguage]: regenerated,
      };
      const updated = await updateClip(clip.id, {
        language: targetLanguage,
        transcripts: nextTranscripts,
      });
      res.json({ clip: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/clips/:id/rerender', requireAuth, async (req, res) => {
    try {
      const clip = getClipById(req.params.id);
      if (!clip || clip.userId !== req.user.id) {
        return res.status(404).json({ error: 'Clip not found' });
      }
      if (!clip.sourcePath || !fs.existsSync(clip.sourcePath)) {
        return res.status(400).json({ error: 'Source video file no longer exists on disk.' });
      }

      const merged = { ...clip, ...(req.body || {}) };
      const sourceInfo = clip.sourceInfo || (await probeVideo(clip.sourcePath));
      const startTime = Math.max(0, Math.min(Number(merged.startTime), sourceInfo.duration - 2));
      const endTime = Math.min(sourceInfo.duration, Math.max(startTime + 2, Number(merged.endTime)));
      const clipDuration = endTime - startTime;

      const format = merged.format || '9:16';
      const layoutMode = merged.layoutMode || 'smart_vertical';
      const language = merged.language || 'english';
      const captionStyle = merged.captionStyle || 'neon_pop';
      const captionPosition = merged.captionPosition || 'auto';
      const showCaptions = merged.showCaptions !== false;
      const outW = format === '16:9' ? 1920 : 1080;
      const outH = format === '9:16' ? 1920 : 1080;

      const words = merged.transcripts?.[language] || merged.transcripts?.english || [];
      const assPath = path.join(storagePaths.subs, `${clip.id}.ass`);
      const assText = generateAssSubtitles({
        words,
        clipStart: startTime,
        clipDuration,
        styleId: captionStyle,
        language,
        width: outW,
        height: outH,
        layoutMode,
        captionPosition,
      });
      await fs.promises.writeFile(assPath, assText, 'utf8');

      const musicTrack = merged.musicTrack || 'none';
      const musicPath =
        musicTrack !== 'none'
          ? await ensureBackgroundMusicTrack(musicTrack, storagePaths.music)
          : null;

      const versionStamp = Date.now();
      const outFilename = `${clip.id}_v${versionStamp}.mp4`;
      const thumbFilename = `${clip.id}_v${versionStamp}.jpg`;
      const outPath = path.join(storagePaths.clips, outFilename);
      const thumbPath = path.join(storagePaths.thumbs, thumbFilename);

      await renderClip({
        sourcePath: clip.sourcePath,
        outPath,
        assPath,
        sourceInfo,
        startTime,
        endTime,
        format,
        layoutMode,
        facecamBox: merged.facecamBox,
        gameplayBox: merged.gameplayBox,
        speakerFocusX: merged.speakerFocusX ?? 0.5,
        showCaptions,
        musicPath,
        voiceVolume: merged.voiceVolume ?? 1.0,
        musicVolume: merged.musicVolume ?? 0.18,
        transitionFade: true,
      });

      await extractThumbnail(outPath, Math.min(1.2, clipDuration / 2), thumbPath);

      if (clip.outputPath && clip.outputPath !== outPath && fs.existsSync(clip.outputPath)) {
        fs.unlink(clip.outputPath, () => {});
      }
      if (clip.thumbPath && clip.thumbPath !== thumbPath && fs.existsSync(clip.thumbPath)) {
        fs.unlink(clip.thumbPath, () => {});
      }

      const updated = await updateClip(clip.id, {
        ...merged,
        startTime,
        endTime,
        duration: Number(clipDuration.toFixed(2)),
        outputPath: outPath,
        thumbPath,
        videoUrl: `/api/media/clips/${outFilename}`,
        thumbUrl: `/api/media/thumbs/${thumbFilename}`,
      });

      res.json({ clip: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/clips/:id/download', requireAuth, (req, res) => {
    const clip = getClipById(req.params.id);
    if (!clip || clip.userId !== req.user.id) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    if (!clip.outputPath || !fs.existsSync(clip.outputPath)) {
      return res.status(404).json({ error: 'Rendered MP4 not found on disk' });
    }
    const safeName = (clip.title || 'clipforge_short')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 48);
    res.download(clip.outputPath, `${safeName}.mp4`);
  });

  app.get('/api/clips/:id/srt', requireAuth, (req, res) => {
    const clip = getClipById(req.params.id);
    if (!clip || clip.userId !== req.user.id) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    const lang = req.query.lang || clip.language || 'english';
    const words = clip.transcripts?.[lang] || clip.transcripts?.english || [];
    const srt = generateSrtSubtitles(words, clip.startTime, clip.duration);
    const safeName = (clip.title || 'captions').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${lang}.srt"`);
    res.send(srt);
  });

  app.delete('/api/clips/:id', requireAuth, async (req, res) => {
    const deleted = await deleteClipById(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Clip not found' });
    res.json({ deleted: true });
  });

  // Livestream Routes
  app.get('/api/livestreams', requireAuth, (req, res) => {
    const streams = listLivestreamsByUser(req.user.id);
    res.json({ streams });
  });

  app.get('/api/livestreams/:id/events', requireAuth, (req, res) => {
    const stream = getLivestreamById(req.params.id);
    if (!stream || stream.userId !== req.user.id) {
      return res.status(404).json({ error: 'Livestream session not found' });
    }
    registerSse(stream.id, req, res);
    res.write(`data: ${JSON.stringify({ type: 'snapshot', stream })}\n\n`);
  });

  app.post('/api/livestreams/start', requireAuth, async (req, res) => {
    try {
      const { title, mode, streamUrl, language, format, captionStyle, minViralScore } =
        req.body || {};

      if (mode === 'hls' && (!streamUrl || !/^https?:\/\//i.test(streamUrl))) {
        return res.status(400).json({
          error: 'An authorized HTTP(S) HLS (.m3u8) stream URL is required for HLS monitoring.',
        });
      }

      const project = await createProject({
        userId: req.user.id,
        title: title || 'Live Stream Clip Session',
        sourceType: mode === 'hls' ? 'livestream_hls' : 'livestream_studio',
        status: 'completed',
        progress: 100,
        stage: 'Live auto-clipping session',
      });

      const stream = await createLivestream({
        userId: req.user.id,
        projectId: project.id,
        title: title || 'Live Stream Session',
        mode: mode || 'studio_capture',
        streamUrl: streamUrl || null,
        language: language || 'english',
        format: format || '9:16',
        captionStyle: captionStyle || 'neon_pop',
        minViralScore: Number(minViralScore || 65),
      });

      if (stream.mode === 'hls') {
        startHlsMonitorLoop(stream, emitProjectEvent);
      }

      res.status(201).json({ stream });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    '/api/livestreams/:id/segment',
    requireAuth,
    segmentUpload.single('segment'),
    async (req, res) => {
      try {
        const stream = getLivestreamById(req.params.id);
        if (!stream || stream.userId !== req.user.id) {
          return res.status(404).json({ error: 'Livestream session not found' });
        }
        if (!req.file) {
          return res.status(400).json({ error: 'No segment file provided' });
        }
        const segIdx = Number(req.body.segmentIndex || (stream.segmentsProcessed || 0) + 1);
        const clip = await processLiveSegmentFile({
          stream,
          segmentPath: req.file.path,
          segmentIndex: segIdx,
          emitEvent: emitProjectEvent,
        });
        res.json({ processed: true, clip });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post('/api/livestreams/:id/stop', requireAuth, async (req, res) => {
    const stream = getLivestreamById(req.params.id);
    if (!stream || stream.userId !== req.user.id) {
      return res.status(404).json({ error: 'Livestream session not found' });
    }
    stopHlsMonitorLoop(stream.id);
    const updated = await updateLivestream(stream.id, { status: 'stopped' });
    emitProjectEvent(stream.id, { type: 'stopped', stream: updated });
    res.json({ stream: updated });
  });

  // Frontend Serving (Vite Dev Middleware or Static Production Build)
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'))) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipForge AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

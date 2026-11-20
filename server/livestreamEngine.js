import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  adjustUserCredits,
  createClip,
  getLivestreamById,
  getStoragePaths,
  updateLivestream,
} from './db.js';
import {
  captureHlsSegment,
  extractThumbnail,
  generateAssSubtitles,
  probeVideo,
  renderClip,
} from './ffmpegEngine.js';
import { analyzeLivestreamSegmentWithGemini } from './geminiPipeline.js';

const activeHlsLoops = new Map();

export async function processLiveSegmentFile({
  stream,
  segmentPath,
  segmentIndex,
  emitEvent,
}) {
  const paths = getStoragePaths();
  const info = await probeVideo(segmentPath);

  emitEvent(stream.id, {
    type: 'segment_analyzing',
    streamId: stream.id,
    segmentIndex,
    message: `Analyzing segment #${segmentIndex} (${info.duration.toFixed(1)}s) with Gemini AI...`,
  });

  const analysis = await analyzeLivestreamSegmentWithGemini({
    segmentPath,
    duration: info.duration,
  });

  const nextSegments = (getLivestreamById(stream.id)?.segmentsProcessed || 0) + 1;
  await updateLivestream(stream.id, { segmentsProcessed: nextSegments });

  const threshold = Number(stream.minViralScore || 65);
  if (analysis.isHighlight || (analysis.viralScore || 0) >= threshold) {
    const clipId = uuidv4();
    const outPath = path.join(paths.clips, `${clipId}.mp4`);
    const thumbPath = path.join(paths.thumbs, `${clipId}.jpg`);
    const assPath = path.join(paths.subs, `${clipId}.ass`);

    const lang = stream.language || 'english';
    const words = analysis.transcripts?.[lang] || analysis.transcripts?.english || [];
    const layoutMode = analysis.recommendedLayout || 'split_screen';

    const format = stream.format || '9:16';
    const outW = format === '16:9' ? 1920 : 1080;
    const outH = format === '9:16' ? 1920 : 1080;

    const assContent = generateAssSubtitles({
      words,
      clipStart: 0,
      clipDuration: info.duration,
      styleId: stream.captionStyle || 'neon_pop',
      language: lang,
      width: outW,
      height: outH,
      layoutMode,
    });
    const fs = await import('fs');
    await fs.promises.writeFile(assPath, assContent, 'utf8');

    await renderClip({
      sourcePath: segmentPath,
      outPath,
      assPath,
      sourceInfo: info,
      startTime: 0,
      endTime: info.duration,
      format: stream.format || '9:16',
      layoutMode,
      facecamBox: analysis.facecamRegion,
      gameplayBox: analysis.gameplayRegion,
      speakerFocusX: 0.5,
      showCaptions: true,
    });

    await extractThumbnail(outPath, Math.min(2, info.duration / 2), thumbPath);

    const clipRecord = await createClip({
      id: clipId,
      userId: stream.userId,
      projectId: stream.projectId,
      livestreamId: stream.id,
      title: analysis.title || `Live Highlight #${segmentIndex}`,
      hook: analysis.hook || '',
      description: `Captured live from ${stream.title}`,
      hashtags: analysis.hashtags || ['#live', '#shorts', '#clipforge'],
      viralScore: analysis.viralScore || 80,
      viralReason: 'Detected live high-engagement moment',
      startTime: 0,
      endTime: info.duration,
      duration: info.duration,
      format: stream.format || '9:16',
      layoutMode,
      language: lang,
      captionStyle: stream.captionStyle || 'neon_pop',
      captionPosition: 'auto',
      showCaptions: true,
      musicTrack: 'none',
      voiceVolume: 1.0,
      musicVolume: 0.15,
      facecamBox: analysis.facecamRegion,
      gameplayBox: analysis.gameplayRegion,
      speakerFocusX: 0.5,
      transcripts: analysis.transcripts,
      sourcePath: segmentPath,
      sourceInfo: info,
      outputPath: outPath,
      thumbPath,
      videoUrl: `/api/media/clips/${clipId}.mp4`,
      thumbUrl: `/api/media/thumbs/${clipId}.jpg`,
    });

    const currentStream = getLivestreamById(stream.id);
    await updateLivestream(stream.id, {
      clipsGenerated: (currentStream?.clipsGenerated || 0) + 1,
    });
    await adjustUserCredits(stream.userId, -2, `Live clip: ${clipRecord.title}`);

    emitEvent(stream.id, {
      type: 'clip_generated',
      streamId: stream.id,
      segmentIndex,
      clip: clipRecord,
      message: `Live clip generated: "${clipRecord.title}" (Score ${clipRecord.viralScore})`,
    });
    return clipRecord;
  }

  emitEvent(stream.id, {
    type: 'segment_skipped',
    streamId: stream.id,
    segmentIndex,
    viralScore: analysis.viralScore || 0,
    message: `Segment #${segmentIndex} scored ${analysis.viralScore || 0}/100 (below ${threshold} threshold).`,
  });
  return null;
}

export function startHlsMonitorLoop(stream, emitEvent) {
  if (activeHlsLoops.has(stream.id)) return;
  const controller = { stopped: false };
  activeHlsLoops.set(stream.id, controller);

  (async () => {
    const paths = getStoragePaths();
    let idx = 1;
    while (!controller.stopped) {
      const current = getLivestreamById(stream.id);
      if (!current || current.status !== 'active') break;
      const segPath = path.join(paths.livestreams, `${stream.id}_seg_${idx}.mp4`);
      try {
        emitEvent(stream.id, {
          type: 'segment_capturing',
          streamId: stream.id,
          segmentIndex: idx,
          message: `Capturing 15s HLS segment #${idx} from authorized stream...`,
        });
        await captureHlsSegment(current.streamUrl, 15, segPath);
        await processLiveSegmentFile({
          stream: current,
          segmentPath: segPath,
          segmentIndex: idx,
          emitEvent,
        });
        idx += 1;
      } catch (err) {
        await updateLivestream(stream.id, {
          status: 'error',
          lastError: err.message,
        });
        emitEvent(stream.id, {
          type: 'stream_error',
          streamId: stream.id,
          error: err.message,
        });
        break;
      }
    }
    activeHlsLoops.delete(stream.id);
  })();
}

export function stopHlsMonitorLoop(streamId) {
  const controller = activeHlsLoops.get(streamId);
  if (controller) {
    controller.stopped = true;
    activeHlsLoops.delete(streamId);
  }
}

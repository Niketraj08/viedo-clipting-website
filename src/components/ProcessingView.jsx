import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ArrowLeft, Download, Edit3 } from 'lucide-react';
import { apiRequest, formatSeconds, getClipDownloadUrl, getToken } from '../lib/api.js';

const PIPELINE_STEPS = [
  { threshold: 10, label: 'Media Stream Inspection (FFprobe)' },
  { threshold: 25, label: 'Gemini Multimodal Video Upload & Indexing' },
  { threshold: 55, label: 'Highlight, Facecam & Gameplay Region Detection' },
  { threshold: 95, label: 'FFmpeg 1080p Split-Screen & Animated CC Render' },
];

export default function ProcessingView({ projectId, onBack, onEditClip, onRefreshUser }) {
  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const token = encodeURIComponent(getToken());
    const evtSource = new EventSource(`/api/projects/${projectId}/events?token=${token}`);

    evtSource.onmessage = (event) => {
      if (!active) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.project) setProject(msg.project);
        if (Array.isArray(msg.clips)) setClips(msg.clips);
        if (msg.type === 'clip_ready' && msg.clip) {
          setClips((prev) => {
            if (prev.some((c) => c.id === msg.clip.id)) return prev;
            return [msg.clip, ...prev];
          });
        }
        if (msg.type === 'completed') {
          onRefreshUser?.();
          evtSource.close();
        }
        if (msg.type === 'error') {
          setError(msg.error || 'Processing failed.');
          evtSource.close();
        }
      } catch {
        // ignore malformed chunk
      }
    };

    evtSource.onerror = async () => {
      // Fallback poll if SSE drops
      try {
        const snap = await apiRequest(`/api/projects/${projectId}`);
        if (active) {
          setProject(snap.project);
          setClips(snap.clips || []);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      active = false;
      evtSource.close();
    };
  }, [projectId, onRefreshUser]);

  const progress = project?.progress || 0;
  const isCompleted = project?.status === 'completed';
  const isFailed = project?.status === 'failed';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>

        {project?.resolution && (
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {project.resolution} · {formatSeconds(project.duration || 0)} source
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {project?.title || 'Processing Project...'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">{project?.stage || 'Initializing pipeline...'}</p>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono tabular-nums">
            {progress}%
          </div>
        </div>

        <div className="h-2.5 rounded-full bg-[#09090F] border border-white/10 overflow-hidden mb-6">
          <div
            className={`h-full transition-all duration-300 ${
              isFailed
                ? 'bg-red-500'
                : isCompleted
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-violet-500 to-blue-500'
            }`}
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>

        {(error || project?.error) && (
          <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error || project?.error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PIPELINE_STEPS.map((step) => {
            const done = isCompleted || progress >= step.threshold + 15;
            const active = !isCompleted && !isFailed && progress >= step.threshold && !done;
            return (
              <div
                key={step.label}
                className={`rounded-xl border p-4 text-xs ${
                  done
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : active
                    ? 'bg-violet-500/10 border-violet-500/40 text-white'
                    : 'bg-[#09090F] border-white/10 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold mb-1">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : active ? (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                  )}
                  <span>{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {project?.summary && (
          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">AI Video Summary: </span>
            {project.summary}
          </div>
        )}
      </div>

      {/* Generated Clips Gallery */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            Generated Clips ({clips.length})
          </h2>
        </div>

        {clips.length === 0 ? (
          <div className="rounded-2xl bg-[#12131F] border border-white/10 p-10 text-center text-sm text-slate-400">
            {isFailed
              ? 'No clips were generated because processing failed.'
              : 'Clips will appear here as soon as FFmpeg completes each render.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clips.map((clip) => (
              <div
                key={clip.id}
                className="rounded-2xl bg-[#12131F] border border-white/10 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[9/16] max-h-[380px] w-full bg-[#09090F] relative">
                    <video
                      src={clip.videoUrl}
                      poster={clip.thumbUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain bg-black"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 font-mono tabular-nums">
                      <span className="text-violet-300 font-semibold">Score {clip.viralScore}/100</span>
                      <span aria-hidden="true">·</span>
                      <span>{clip.duration}s</span>
                      <span aria-hidden="true">·</span>
                      <span>{clip.format}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{clip.language}</span>
                    </div>
                    <h3 className="text-base font-bold text-white leading-snug mb-1.5">
                      {clip.title}
                    </h3>
                    {clip.hook && (
                      <p className="text-xs text-slate-300 line-clamp-2 mb-3">
                        Hook: &ldquo;{clip.hook}&rdquo;
                      </p>
                    )}
                    <p className="text-xs text-slate-400 line-clamp-2">{clip.viralReason}</p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditClip(clip)}
                    className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Open Editor</span>
                  </button>
                  <a
                    href={getClipDownloadUrl(clip.id)}
                    download
                    className="py-2 px-3 rounded-lg neon-accent-btn text-xs font-semibold text-white transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>MP4</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { Film, Link2, Sparkles, Upload, AlertCircle, Play, CheckCircle2 } from 'lucide-react';
import { apiRequest, uploadWithProgress } from '../lib/api.js';

export default function NewProjectView({ user, onProjectStarted }) {
  const fileInputRef = useRef(null);
  const [sourceMode, setSourceMode] = useState('upload'); // 'upload' | 'url'
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [urlLookup, setUrlLookup] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState(user?.settings?.defaultLanguage || 'english');
  const [format, setFormat] = useState(user?.settings?.defaultFormat || '9:16');
  const [layoutPreference, setLayoutPreference] = useState('auto');
  const [captionStyle, setCaptionStyle] = useState(user?.settings?.defaultCaptionStyle || 'neon_pop');
  const [musicTrack, setMusicTrack] = useState('none');
  const [clipCount, setClipCount] = useState(3);

  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLookupUrl() {
    if (!videoUrl.trim()) return;
    setError('');
    setLookingUp(true);
    setUrlLookup(null);
    try {
      const meta = await apiRequest('/api/projects/lookup-url', {
        method: 'POST',
        body: { url: videoUrl.trim() },
      });
      setUrlLookup(meta);
      if (meta.title && !title) {
        setTitle(meta.title);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSubmitUpload(e) {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a video file (.mp4, .mov, .webm, .mkv) to upload.');
      return;
    }
    setError('');
    setSubmitting(true);
    setUploadPct(0);
    try {
      const formData = new FormData();
      formData.append('video', selectedFile);
      formData.append('title', title.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('language', language);
      formData.append('format', format);
      formData.append('layoutPreference', layoutPreference);
      formData.append('captionStyle', captionStyle);
      formData.append('musicTrack', musicTrack);
      formData.append('clipCount', String(clipCount));

      const data = await uploadWithProgress('/api/projects/process-upload', formData, (pct) => {
        setUploadPct(pct);
      });
      onProjectStarted(data.project);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleSubmitUrl(e) {
    e.preventDefault();
    if (!videoUrl.trim()) {
      setError('Enter a direct MP4 or HLS (.m3u8) VOD URL.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const meta =
        urlLookup ||
        (await apiRequest('/api/projects/lookup-url', {
          method: 'POST',
          body: { url: videoUrl.trim() },
        }));
      setUrlLookup(meta);
      if (!meta.directIngestSupported) {
        setSubmitting(false);
        return;
      }
      const data = await apiRequest('/api/projects/process-url', {
        method: 'POST',
        body: {
          url: videoUrl.trim(),
          title: title.trim() || meta.title || 'Stream Clip Project',
          language,
          format,
          layoutPreference,
          captionStyle,
          musicTrack,
          clipCount,
        },
      });
      onProjectStarted(data.project);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleGenerateSample() {
    setError('');
    setSubmitting(true);
    try {
      const data = await apiRequest('/api/projects/sample', {
        method: 'POST',
        body: {
          language,
          format,
          layoutPreference: layoutPreference === 'auto' ? 'split_screen' : layoutPreference,
          captionStyle,
          musicTrack: musicTrack === 'none' ? 'synth_pulse' : musicTrack,
        },
      });
      onProjectStarted(data.project);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">New AI Clipping Project</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload a video, paste a direct VOD/HLS stream URL, or test the end-to-end sample
            studio VOD.
          </p>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleGenerateSample}
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>Try Sample Gaming + Facecam VOD</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6 sm:p-8">
        {/* Source Mode Switch */}
        <div className="flex p-1 rounded-xl bg-[#09090F] border border-white/10 max-w-md mb-6">
          <button
            type="button"
            onClick={() => {
              setSourceMode('upload');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap ${
              sourceMode === 'upload' ? 'bg-[#1D1F33] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Video File</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode('url');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap ${
              sourceMode === 'url' ? 'bg-[#1D1F33] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Paste Video / Stream URL</span>
          </button>
        </div>

        <form onSubmit={sourceMode === 'upload' ? handleSubmitUpload : handleSubmitUrl} className="space-y-6">
          {sourceMode === 'upload' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
                  }
                }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className="rounded-xl border border-dashed border-white/20 hover:border-violet-500/70 bg-[#09090F]/70 p-8 text-center cursor-pointer transition-colors"
              >
                <Film className="w-8 h-8 text-violet-400 mx-auto mb-3" />
                {selectedFile ? (
                  <div>
                    <div className="text-sm font-semibold text-white">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click to change file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Drop your video here, or click to browse
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Supports MP4, MOV, WebM, MKV up to 500 MB
                    </div>
                  </div>
                )}
              </div>

              {submitting && uploadPct > 0 && uploadPct < 100 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-mono tabular-nums">
                    <span>Uploading source video...</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="vod-url">
                  Kick VOD/Live URL, Direct MP4 / HLS (.m3u8) URL, or YouTube Link
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="vod-url"
                    type="url"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      setUrlLookup(null);
                    }}
                    placeholder="https://kick.com/channel/videos/... or https://example.com/vod.mp4"
                    className="flex-1 rounded-xl bg-[#09090F] border border-white/15 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    disabled={lookingUp || !videoUrl.trim()}
                    onClick={handleLookupUrl}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {lookingUp ? 'Checking URL...' : 'Inspect URL'}
                  </button>
                </div>
              </div>

              {urlLookup && (
                <div className="rounded-xl bg-[#09090F] border border-white/10 p-4 flex flex-col sm:flex-row gap-4 items-start">
                  {urlLookup.thumbnailUrl && (
                    <img
                      src={urlLookup.thumbnailUrl}
                      alt={urlLookup.title}
                      referrerPolicy="no-referrer"
                      className="w-36 aspect-video rounded-lg object-cover border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                      {urlLookup.directIngestSupported ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ready for FFmpeg stream ingestion
                        </span>
                      ) : (
                        <span className="text-amber-300 inline-flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Source file or active direct stream required
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{urlLookup.title}</div>
                    {urlLookup.author && (
                      <div className="text-xs text-slate-400 mt-0.5">{urlLookup.author}</div>
                    )}
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{urlLookup.notice}</p>
                    {!urlLookup.directIngestSupported && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('upload')}
                        className="mt-3 text-xs font-semibold text-violet-300 hover:text-violet-200 underline"
                      >
                        Switch to File Upload to process your MP4/MKV directly
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Project Title & AI Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-title">
                Project Name
              </label>
              <input
                id="proj-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Episode 42 Gaming Highlight"
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-lang">
                Subtitle &amp; CC Language
              </label>
              <select
                id="proj-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi (हिन्दी Devanagari)</option>
                <option value="hinglish">Hinglish (Hindi + English Roman)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-layout">
                Framing Layout
              </label>
              <select
                id="proj-layout"
                value={layoutPreference}
                onChange={(e) => setLayoutPreference(e.target.value)}
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="auto">Auto Detect (Recommended)</option>
                <option value="split_screen">Gaming Split-Screen (Facecam Top + Gameplay Bottom)</option>
                <option value="active_speaker">Podcast Active Speaker</option>
                <option value="smart_vertical">Smart Center Crop</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-format">
                Export Aspect Ratio
              </label>
              <select
                id="proj-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="9:16">9:16 Vertical Shorts (1080x1920)</option>
                <option value="1:1">1:1 Square Feed (1080x1080)</option>
                <option value="16:9">16:9 Widescreen (1920x1080)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-style">
                Caption Animation Style
              </label>
              <select
                id="proj-style"
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value)}
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="neon_pop">Neon Pop (Amber &amp; Violet Keywords)</option>
                <option value="hormozi_impact">Impact Bold (High-Contrast Emerald &amp; Gold)</option>
                <option value="bold_clean">Bold Clean Boxed</option>
                <option value="minimal_cinematic">Minimal Cinematic</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="proj-music">
                Background Music &amp; Clip Count
              </label>
              <div className="flex gap-2">
                <select
                  id="proj-music"
                  value={musicTrack}
                  onChange={(e) => setMusicTrack(e.target.value)}
                  className="flex-1 rounded-xl bg-[#09090F] border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="none">Original Audio Only</option>
                  <option value="synth_pulse">Synth Pulse Bed</option>
                  <option value="lofi_chill">Lo-Fi Chill Bed</option>
                  <option value="hype_bass">Hype Bass Bed</option>
                </select>
                <select
                  aria-label="Number of clips"
                  value={clipCount}
                  onChange={(e) => setClipCount(Number(e.target.value))}
                  className="w-24 rounded-xl bg-[#09090F] border border-white/10 px-2.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                >
                  <option value={2}>2 clips</option>
                  <option value={3}>3 clips</option>
                  <option value={4}>4 clips</option>
                  <option value={5}>5 clips</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-xs text-slate-400">
              Estimated cost: <span className="text-slate-200 font-mono tabular-nums">{Math.max(5, clipCount * 4)} credits</span> · Available:{' '}
              <span className="text-slate-200 font-mono tabular-nums">{user?.credits ?? 0} credits</span>
            </div>

            <button
              type="submit"
              disabled={submitting || (sourceMode === 'url' && urlLookup && !urlLookup.directIngestSupported)}
              className="neon-accent-btn text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{submitting ? 'Starting Pipeline...' : 'Generate AI Clips'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

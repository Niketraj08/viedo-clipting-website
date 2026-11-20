import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileText,
  Languages,
  RefreshCw,
  Scissors,
  Search,
  Sliders,
  Trash2,
  Volume2,
  Wand2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  apiRequest,
  formatPreciseSeconds,
  getClipDownloadUrl,
  getClipSrtUrl,
} from '../lib/api.js';

export function ClipEditorView({ clip: initialClip, onBack, onClipUpdated }) {
  const [clip, setClip] = useState(initialClip);
  const [title, setTitle] = useState(initialClip.title || '');
  const [hook, setHook] = useState(initialClip.hook || '');
  const [description, setDescription] = useState(initialClip.description || '');
  const [hashtagsText, setHashtagsText] = useState((initialClip.hashtags || []).join(' '));

  const [startTime, setStartTime] = useState(Number(initialClip.startTime || 0));
  const [endTime, setEndTime] = useState(Number(initialClip.endTime || 15));
  const [format, setFormat] = useState(initialClip.format || '9:16');
  const [layoutMode, setLayoutMode] = useState(initialClip.layoutMode || 'smart_vertical');
  const [speakerFocusX, setSpeakerFocusX] = useState(Number(initialClip.speakerFocusX ?? 0.5));
  const [facecamBox, setFacecamBox] = useState(
    initialClip.facecamBox || { x: 0.02, y: 0.04, w: 0.32, h: 0.38 }
  );
  const [gameplayBox, setGameplayBox] = useState(
    initialClip.gameplayBox || { x: 0.12, y: 0.08, w: 0.82, h: 0.86 }
  );

  const [language, setLanguage] = useState(initialClip.language || 'english');
  const [captionStyle, setCaptionStyle] = useState(initialClip.captionStyle || 'neon_pop');
  const [captionPosition, setCaptionPosition] = useState(initialClip.captionPosition || 'auto');
  const [showCaptions, setShowCaptions] = useState(initialClip.showCaptions !== false);
  const [transcripts, setTranscripts] = useState(
    initialClip.transcripts || { english: [], hindi: [], hinglish: [] }
  );

  const [musicTrack, setMusicTrack] = useState(initialClip.musicTrack || 'none');
  const [voiceVolume, setVoiceVolume] = useState(Number(initialClip.voiceVolume ?? 1.0));
  const [musicVolume, setMusicVolume] = useState(Number(initialClip.musicVolume ?? 0.18));

  const [activeTab, setActiveTab] = useState('layout'); // 'layout' | 'captions' | 'audio' | 'metadata'
  const [rendering, setRendering] = useState(false);
  const [regeneratingSubs, setRegeneratingSubs] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPlaySec, setCurrentPlaySec] = useState(0);

  const maxDuration = Number(clip.sourceInfo?.duration || Math.max(endTime + 10, 60));
  const activeWords = transcripts?.[language] || transcripts?.english || [];

  useEffect(() => {
    setClip(initialClip);
  }, [initialClip]);

  async function handleRerender() {
    setError('');
    setStatusMessage('');
    setRendering(true);
    try {
      const payload = {
        title: title.trim() || 'Untitled Clip',
        hook: hook.trim(),
        description: description.trim(),
        hashtags: hashtagsText
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean),
        startTime: Number(startTime),
        endTime: Math.max(Number(startTime) + 2, Number(endTime)),
        format,
        layoutMode,
        speakerFocusX: Number(speakerFocusX),
        facecamBox,
        gameplayBox,
        language,
        captionStyle,
        captionPosition,
        showCaptions,
        transcripts,
        musicTrack,
        voiceVolume: Number(voiceVolume),
        musicVolume: Number(musicVolume),
      };
      const data = await apiRequest(`/api/clips/${clip.id}/rerender`, {
        method: 'POST',
        body: payload,
      });
      setClip(data.clip);
      onClipUpdated?.(data.clip);
      setStatusMessage('Rendered updated 1080p MP4 with FFmpeg.');
    } catch (err) {
      setError(err.message);
    } finally {
      setRendering(false);
    }
  }

  async function handleRegenerateLanguage() {
    setError('');
    setStatusMessage('');
    setRegeneratingSubs(true);
    try {
      const data = await apiRequest(`/api/clips/${clip.id}/regenerate-captions`, {
        method: 'POST',
        body: { language },
      });
      setTranscripts(data.clip.transcripts || transcripts);
      setClip(data.clip);
      onClipUpdated?.(data.clip);
      setStatusMessage(`Generated ${language} captions via Gemini AI. Click Re-render MP4 to burn them in.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegeneratingSubs(false);
    }
  }

  function handleWordEdit(idx, nextText) {
    setTranscripts((prev) => {
      const list = [...(prev[language] || [])];
      if (!list[idx]) return prev;
      list[idx] = { ...list[idx], word: nextText };
      return { ...prev, [language]: list };
    });
  }

  function handleToggleWordHighlight(idx) {
    setTranscripts((prev) => {
      const list = [...(prev[language] || [])];
      if (!list[idx]) return prev;
      list[idx] = { ...list[idx], highlight: !list[idx].highlight };
      return { ...prev, [language]: list };
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg bg-[#12131F] border border-white/10 text-slate-300 hover:text-white transition-colors"
            aria-label="Back to clip gallery"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white truncate max-w-md">{title}</h1>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              Viral Score {clip.viralScore}/100 · {format} · {(endTime - startTime).toFixed(1)}s
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={getClipSrtUrl(clip.id, language)}
            download
            className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download SRT</span>
          </a>
          <a
            href={getClipDownloadUrl(clip.id)}
            download
            className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download MP4</span>
          </a>
          <button
            type="button"
            disabled={rendering}
            onClick={handleRerender}
            className="neon-accent-btn px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rendering ? 'animate-spin' : ''}`} />
            <span>{rendering ? 'Rendering 1080p MP4...' : 'Render 1080p MP4'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {statusMessage && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Video Player Preview */}
        <div className="lg:col-span-5 rounded-2xl bg-[#12131F] border border-white/10 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span className="font-semibold text-slate-200">Rendered Output Preview</span>
            <span className="font-mono tabular-nums">{format} · 1080p H.264</span>
          </div>

          <div
            className={`w-full mx-auto rounded-xl overflow-hidden bg-black border border-white/10 ${
              format === '9:16'
                ? 'max-w-[320px] aspect-[9/16]'
                : format === '1:1'
                ? 'max-w-[400px] aspect-square'
                : 'aspect-video'
            }`}
          >
            <video
              key={clip.videoUrl}
              src={clip.videoUrl}
              poster={clip.thumbUrl}
              controls
              onTimeUpdate={(e) => setCurrentPlaySec(e.currentTarget.currentTime)}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Live synced transcript strip */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-xs font-medium text-slate-400 mb-2">
              Synchronized Transcript ({language})
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 text-xs leading-relaxed">
              {activeWords.length === 0 ? (
                <span className="text-slate-500">No transcript tokens for this language yet.</span>
              ) : (
                activeWords.map((w, idx) => {
                  const relStart = Number(w.start) - startTime;
                  const relEnd = Number(w.end) - startTime;
                  const isActive = currentPlaySec >= relStart && currentPlaySec <= relEnd;
                  return (
                    <span
                      key={`${idx}-${w.start}`}
                      className={`px-1 rounded transition-colors ${
                        isActive
                          ? 'bg-violet-500/40 text-white font-semibold'
                          : w.highlight
                          ? 'text-amber-300 font-medium'
                          : 'text-slate-300'
                      }`}
                    >
                      {w.word}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Multi-Tab Video Editor */}
        <div className="lg:col-span-7 rounded-2xl bg-[#12131F] border border-white/10 p-6">
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#09090F] border border-white/10 mb-6">
            {[
              { id: 'layout', label: 'Trim & Framing', icon: Scissors },
              { id: 'captions', label: 'Captions & CC', icon: Languages },
              { id: 'audio', label: 'Audio & Music', icon: Volume2 },
              { id: 'metadata', label: 'AI Hook & Tags', icon: Sliders },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[#1D1F33] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === 'layout' && (
            <div className="space-y-6">
              {/* Trim timestamps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Start Time</span>
                    <span className="font-mono tabular-nums text-violet-300">
                      {formatPreciseSeconds(startTime)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, endTime - 3)}
                    step={0.2}
                    value={startTime}
                    onChange={(e) => setStartTime(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">End Time</span>
                    <span className="font-mono tabular-nums text-blue-300">
                      {formatPreciseSeconds(endTime)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(maxDuration, startTime + 3)}
                    max={maxDuration}
                    step={0.2}
                    value={endTime}
                    onChange={(e) => setEndTime(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              {/* Format & Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Aspect Ratio
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['9:16', '1:1', '16:9'].map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormat(fmt)}
                        className={`py-2 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                          format === fmt
                            ? 'bg-violet-500/20 border-violet-500 text-white'
                            : 'bg-[#09090F] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Layout Engine
                  </label>
                  <select
                    value={layoutMode}
                    onChange={(e) => setLayoutMode(e.target.value)}
                    className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="split_screen">Split-Screen (Facecam Top + Gameplay Bottom)</option>
                    <option value="active_speaker">Podcast Active Speaker</option>
                    <option value="smart_vertical">Smart Center Crop</option>
                  </select>
                </div>
              </div>

              {layoutMode === 'split_screen' && format === '9:16' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div className="rounded-xl bg-[#09090F] border border-white/10 p-4 space-y-3">
                    <div className="text-xs font-semibold text-violet-300">
                      Top Region: Facecam Crop (Normalized)
                    </div>
                    {[
                      { key: 'x', label: 'X Offset' },
                      { key: 'y', label: 'Y Offset' },
                      { key: 'w', label: 'Width' },
                      { key: 'h', label: 'Height' },
                    ].map((axis) => (
                      <div key={axis.key} className="flex items-center gap-3 text-xs">
                        <span className="w-16 text-slate-400">{axis.label}</span>
                        <input
                          type="range"
                          min={0}
                          max={axis.key === 'w' || axis.key === 'h' ? 1 : 0.8}
                          step={0.02}
                          value={facecamBox[axis.key] ?? 0.2}
                          onChange={(e) =>
                            setFacecamBox((prev) => ({
                              ...prev,
                              [axis.key]: Number(e.target.value),
                            }))
                          }
                          className="flex-1 accent-violet-500"
                        />
                        <span className="w-10 text-right font-mono tabular-nums text-slate-300">
                          {Math.round((facecamBox[axis.key] ?? 0) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-[#09090F] border border-white/10 p-4 space-y-3">
                    <div className="text-xs font-semibold text-blue-300">
                      Bottom Region: Gameplay / Screen Crop
                    </div>
                    {[
                      { key: 'x', label: 'X Offset' },
                      { key: 'y', label: 'Y Offset' },
                      { key: 'w', label: 'Width' },
                      { key: 'h', label: 'Height' },
                    ].map((axis) => (
                      <div key={axis.key} className="flex items-center gap-3 text-xs">
                        <span className="w-16 text-slate-400">{axis.label}</span>
                        <input
                          type="range"
                          min={0}
                          max={axis.key === 'w' || axis.key === 'h' ? 1 : 0.8}
                          step={0.02}
                          value={gameplayBox[axis.key] ?? 0.2}
                          onChange={(e) =>
                            setGameplayBox((prev) => ({
                              ...prev,
                              [axis.key]: Number(e.target.value),
                            }))
                          }
                          className="flex-1 accent-blue-500"
                        />
                        <span className="w-10 text-right font-mono tabular-nums text-slate-300">
                          {Math.round((gameplayBox[axis.key] ?? 0) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-white/10">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">
                      Active Speaker Horizontal Focus
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {Math.round(speakerFocusX * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.85}
                    step={0.02}
                    value={speakerFocusX}
                    onChange={(e) => setSpeakerFocusX(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'captions' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Caption Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    <option value="english">English</option>
                    <option value="hindi">Hindi (हिन्दी)</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Animation Style
                  </label>
                  <select
                    value={captionStyle}
                    onChange={(e) => setCaptionStyle(e.target.value)}
                    className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    <option value="neon_pop">Neon Pop</option>
                    <option value="hormozi_impact">Impact Bold</option>
                    <option value="bold_clean">Bold Clean</option>
                    <option value="minimal_cinematic">Minimal Cinematic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Safe Area Position
                  </label>
                  <select
                    value={captionPosition}
                    onChange={(e) => setCaptionPosition(e.target.value)}
                    className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    <option value="auto">Auto Safe Area</option>
                    <option value="middle">Center Middle</option>
                    <option value="bottom">Lower Third</option>
                    <option value="top">Upper Safe Area</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCaptions}
                    onChange={(e) => setShowCaptions(e.target.checked)}
                    className="rounded accent-violet-500"
                  />
                  <span>Burn animated CC captions into rendered MP4</span>
                </label>

                <button
                  type="button"
                  disabled={regeneratingSubs}
                  onClick={handleRegenerateLanguage}
                  className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5 text-violet-300" />
                  <span>
                    {regeneratingSubs ? 'Generating...' : `Regenerate ${language} via AI`}
                  </span>
                </button>
              </div>

              {/* Word-by-word inline editor */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Edit words or click &ldquo;*&rdquo; to toggle keyword color highlight</span>
                  <span className="font-mono tabular-nums">{activeWords.length} words</span>
                </div>
                <div className="max-h-56 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pr-1">
                  {activeWords.map((item, idx) => (
                    <div
                      key={`${idx}-${item.start}`}
                      className="flex items-center gap-1 rounded-lg bg-[#09090F] border border-white/10 px-2 py-1"
                    >
                      <input
                        type="text"
                        value={item.word}
                        onChange={(e) => handleWordEdit(idx, e.target.value)}
                        className="w-full bg-transparent text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleWordHighlight(idx)}
                        title="Toggle keyword highlight color"
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          item.highlight
                            ? 'bg-amber-400/20 text-amber-300'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        *
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">Original Speech / Audio Volume</span>
                  <span className="font-mono tabular-nums text-white">
                    {Math.round(voiceVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Background Music Bed
                </label>
                <select
                  value={musicTrack}
                  onChange={(e) => setMusicTrack(e.target.value)}
                  className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                >
                  <option value="none">None (Original Audio Only)</option>
                  <option value="synth_pulse">Synth Pulse</option>
                  <option value="lofi_chill">Lo-Fi Chill</option>
                  <option value="hype_bass">Hype Bass</option>
                </select>
              </div>

              {musicTrack !== 'none' && (
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Background Music Level</span>
                    <span className="font-mono tabular-nums text-blue-300">
                      {Math.round(musicVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={0.6}
                    step={0.02}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Clip Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Opening Hook</label>
                <input
                  type="text"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Social Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Hashtags</label>
                <input
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  className="w-full rounded-lg bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-slate-300 font-mono"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClipGalleryView({ onSelectClip, onNewProject }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');

  async function loadClips() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/clips');
      setClips(data.clips || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClips();
  }, []);

  async function handleDelete(clipId) {
    await apiRequest(`/api/clips/${clipId}`, { method: 'DELETE' });
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  }

  const filtered = clips.filter((c) => {
    const matchesFormat = formatFilter === 'all' || c.format === formatFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.hook || '').toLowerCase().includes(q);
    return matchesFormat && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Clip Gallery</h1>
          <p className="text-sm text-slate-400 mt-1">
            All rendered shorts across your uploaded videos and live stream sessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clips..."
              className="rounded-lg bg-[#12131F] border border-white/10 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex p-1 rounded-lg bg-[#12131F] border border-white/10">
            {['all', '9:16', '1:1', '16:9'].map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatFilter(fmt)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  formatFilter === fmt
                    ? 'bg-[#1D1F33] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {fmt === 'all' ? 'All' : fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-80 rounded-2xl bg-[#12131F] border border-white/10 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#12131F] border border-white/10 p-12 text-center">
          <h3 className="text-base font-semibold text-white mb-2">No clips rendered yet</h3>
          <p className="text-sm text-slate-400 mb-6">
            Upload a video, paste a direct stream URL, or run the sample studio VOD to generate
            viral clips.
          </p>
          <button
            type="button"
            onClick={onNewProject}
            className="neon-accent-btn px-5 py-2.5 rounded-xl text-xs font-semibold text-white"
          >
            Create First Clip Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((clip) => (
            <div
              key={clip.id}
              className="rounded-2xl bg-[#12131F] border border-white/10 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="aspect-[9/16] max-h-[340px] bg-black">
                  <video
                    src={clip.videoUrl}
                    poster={clip.thumbUrl}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 font-mono tabular-nums">
                    <span className="text-violet-300 font-semibold">Score {clip.viralScore}</span>
                    <span aria-hidden="true">·</span>
                    <span>{clip.duration}s</span>
                    <span aria-hidden="true">·</span>
                    <span>{clip.format}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{clip.language}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white line-clamp-2 mb-1">{clip.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{clip.viralReason}</p>
                </div>
              </div>

              <div className="px-5 pb-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectClip(clip)}
                  className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
                >
                  Edit Clip
                </button>
                <a
                  href={getClipDownloadUrl(clip.id)}
                  download
                  className="py-2 px-3 rounded-lg neon-accent-btn text-xs font-semibold text-white transition-all inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>MP4</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(clip.id)}
                  aria-label="Delete clip"
                  className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

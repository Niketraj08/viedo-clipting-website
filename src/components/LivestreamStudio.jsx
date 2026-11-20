import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Download,
  Monitor,
  Radio,
  Square,
} from 'lucide-react';
import { apiRequest, getClipDownloadUrl, getToken } from '../lib/api.js';

export default function LivestreamStudio({ onEditClip, onRefreshUser }) {
  const [mode, setMode] = useState('studio_capture'); // 'studio_capture' | 'hls'
  const [captureSource, setCaptureSource] = useState('camera'); // 'camera' | 'screen'
  const [title, setTitle] = useState('Live Creator Highlight Session');
  const [streamUrl, setStreamUrl] = useState('');
  const [language, setLanguage] = useState('english');
  const [format, setFormat] = useState('9:16');
  const [minViralScore, setMinViralScore] = useState(65);

  const [activeStream, setActiveStream] = useState(null);
  const [pastStreams, setPastStreams] = useState([]);
  const [events, setEvents] = useState([]);
  const [liveClips, setLiveClips] = useState([]);
  const [error, setError] = useState('');

  const videoPreviewRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recorderTimerRef = useRef(null);
  const segmentCounterRef = useRef(0);
  const activeStreamRef = useRef(null);

  useEffect(() => {
    apiRequest('/api/livestreams')
      .then((d) => setPastStreams(d.streams || []))
      .catch(() => {});

    return () => {
      cleanupMediaCapture();
    };
  }, []);

  function cleanupMediaCapture() {
    if (recorderTimerRef.current) {
      clearInterval(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  function subscribeStreamEvents(streamId) {
    const token = encodeURIComponent(getToken());
    const evt = new EventSource(`/api/livestreams/${streamId}/events?token=${token}`);
    evt.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.message) {
          setEvents((prev) => [{ id: Date.now() + Math.random(), text: msg.message }, ...prev].slice(0, 30));
        }
        if (msg.type === 'clip_generated' && msg.clip) {
          setLiveClips((prev) => [msg.clip, ...prev]);
          onRefreshUser?.();
        }
        if (msg.type === 'stream_error') {
          setError(msg.error || 'HLS stream ended or failed.');
          setActiveStream((prev) => (prev ? { ...prev, status: 'error' } : prev));
          evt.close();
        }
        if (msg.type === 'stopped') {
          evt.close();
        }
      } catch {
        // ignore
      }
    };
    return evt;
  }

  async function recordAndSendChunk(mediaStream, streamId) {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    const recorder = new MediaRecorder(mediaStream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (evt) => {
      if (evt.data && evt.data.size > 0) chunks.push(evt.data);
    };
    recorder.onstop = async () => {
      if (!activeStreamRef.current || chunks.length === 0) return;
      segmentCounterRef.current += 1;
      const segIdx = segmentCounterRef.current;
      const blob = new Blob(chunks, { type: mimeType });
      const formData = new FormData();
      formData.append('segment', blob, `live_seg_${segIdx}.webm`);
      formData.append('segmentIndex', String(segIdx));

      setEvents((prev) => [
        { id: Date.now(), text: `Uploaded 12s live segment #${segIdx} for AI highlight scoring...` },
        ...prev,
      ]);

      try {
        const token = getToken();
        const res = await fetch(`/api/livestreams/${streamId}/segment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setEvents((prev) => [
            { id: Date.now(), text: `Segment #${segIdx} error: ${errData.error || res.status}` },
            ...prev,
          ]);
        }
      } catch (err) {
        setEvents((prev) => [
          { id: Date.now(), text: `Segment #${segIdx} upload failed: ${err.message}` },
          ...prev,
        ]);
      }
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, 12000);
  }

  async function handleStartSession(e) {
    e.preventDefault();
    setError('');
    setEvents([]);
    setLiveClips([]);

    try {
      let localMedia = null;
      if (mode === 'studio_capture') {
        if (captureSource === 'screen') {
          localMedia = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } else {
          localMedia = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true,
          });
        }
        mediaStreamRef.current = localMedia;
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = localMedia;
        }
      }

      const data = await apiRequest('/api/livestreams/start', {
        method: 'POST',
        body: {
          title,
          mode,
          streamUrl: mode === 'hls' ? streamUrl.trim() : null,
          language,
          format,
          minViralScore: Number(minViralScore),
        },
      });

      setActiveStream(data.stream);
      activeStreamRef.current = data.stream;
      subscribeStreamEvents(data.stream.id);

      if (mode === 'studio_capture' && localMedia) {
        segmentCounterRef.current = 0;
        recordAndSendChunk(localMedia, data.stream.id);
        recorderTimerRef.current = setInterval(() => {
          if (activeStreamRef.current) {
            recordAndSendChunk(localMedia, data.stream.id);
          }
        }, 12500);
      }
    } catch (err) {
      cleanupMediaCapture();
      setError(err.message);
    }
  }

  async function handleStopSession() {
    if (!activeStream) return;
    cleanupMediaCapture();
    activeStreamRef.current = null;
    try {
      const data = await apiRequest(`/api/livestreams/${activeStream.id}/stop`, {
        method: 'POST',
      });
      setActiveStream(null);
      setPastStreams((prev) => [data.stream, ...prev.filter((s) => s.id !== data.stream.id)]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Livestream Auto-Clipper</h1>
        <p className="text-sm text-slate-400 mt-1">
          Ingest live segments from Browser Studio Capture (Camera/Screen) or an authorized HLS
          (.m3u8) feed. Gemini AI scores each segment and renders viral shorts automatically.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 rounded-2xl bg-[#12131F] border border-white/10 p-6 space-y-5">
          <div className="flex p-1 rounded-xl bg-[#09090F] border border-white/10">
            <button
              type="button"
              disabled={Boolean(activeStream)}
              onClick={() => setMode('studio_capture')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'studio_capture'
                  ? 'bg-[#1D1F33] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Browser Live Capture
            </button>
            <button
              type="button"
              disabled={Boolean(activeStream)}
              onClick={() => setMode('hls')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'hls' ? 'bg-[#1D1F33] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Authorized HLS (.m3u8)
            </button>
          </div>

          <form onSubmit={handleStartSession} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Stream Session Title
              </label>
              <input
                type="text"
                disabled={Boolean(activeStream)}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            {mode === 'studio_capture' ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Capture Input
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(activeStream)}
                    onClick={() => setCaptureSource('camera')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 ${
                      captureSource === 'camera'
                        ? 'bg-violet-500/15 border-violet-500 text-white'
                        : 'bg-[#09090F] border-white/10 text-slate-400'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Webcam + Mic</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(activeStream)}
                    onClick={() => setCaptureSource('screen')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 ${
                      captureSource === 'screen'
                        ? 'bg-violet-500/15 border-violet-500 text-white'
                        : 'bg-[#09090F] border-white/10 text-slate-400'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>Screen + Audio</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Authorized HLS Live Stream URL (.m3u8)
                </label>
                <input
                  type="url"
                  required
                  disabled={Boolean(activeStream)}
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://stream.example.com/live/playlist.m3u8"
                  className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-slate-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Language</label>
                <select
                  disabled={Boolean(activeStream)}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="hinglish">Hinglish</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Format</label>
                <select
                  disabled={Boolean(activeStream)}
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3 py-2 text-xs text-white"
                >
                  <option value="9:16">9:16 Vertical</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="16:9">16:9 Widescreen</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Auto-Clip Viral Score Threshold</span>
                <span className="font-mono tabular-nums text-violet-300">{minViralScore}/100</span>
              </div>
              <input
                type="range"
                min={40}
                max={90}
                step={5}
                disabled={Boolean(activeStream)}
                value={minViralScore}
                onChange={(e) => setMinViralScore(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            {!activeStream ? (
              <button
                type="submit"
                className="w-full neon-accent-btn py-2.5 px-4 rounded-xl text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
              >
                <Radio className="w-4 h-4" />
                <span>Start Live Auto-Clipping</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopSession}
                className="w-full bg-red-600 hover:bg-red-500 py-2.5 px-4 rounded-xl text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                <span>Stop Live Session</span>
              </button>
            )}
          </form>
        </div>

        {/* Right: Live Monitor & Generated Clips */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                {activeStream && (
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                )}
                <span>{activeStream ? `Live: ${activeStream.title}` : 'Live Monitor Idle'}</span>
              </div>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {liveClips.length} clips generated
              </span>
            </div>

            {mode === 'studio_capture' && (
              <div className="aspect-video w-full rounded-xl bg-[#09090F] border border-white/10 overflow-hidden mb-4 flex items-center justify-center">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="rounded-xl bg-[#09090F] border border-white/10 p-4 max-h-48 overflow-y-auto space-y-2 text-xs">
              {events.length === 0 ? (
                <div className="text-slate-500">
                  Start a session to stream 12–15s segments to Gemini AI and watch live clip
                  decisions appear here.
                </div>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="text-slate-300 border-b border-white/5 pb-1.5 last:border-0">
                    {ev.text}
                  </div>
                ))
              )}
            </div>
          </div>

          {liveClips.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {liveClips.map((clip) => (
                <div
                  key={clip.id}
                  className="rounded-2xl bg-[#12131F] border border-white/10 overflow-hidden"
                >
                  <div className="aspect-[9/16] max-h-64 bg-black">
                    <video
                      src={clip.videoUrl}
                      poster={clip.thumbUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-violet-300 font-mono tabular-nums mb-1">
                      Score {clip.viralScore}/100 · {clip.duration}s
                    </div>
                    <div className="text-sm font-bold text-white mb-3">{clip.title}</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEditClip(clip)}
                        className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                      >
                        Edit
                      </button>
                      <a
                        href={getClipDownloadUrl(clip.id)}
                        download
                        className="py-1.5 px-3 rounded-lg neon-accent-btn text-xs font-semibold text-white inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>MP4</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pastStreams.length > 0 && (
            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6">
              <h3 className="text-sm font-semibold text-white mb-3">Recent Live Sessions</h3>
              <div className="space-y-2">
                {pastStreams.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-xs py-2 border-b border-white/5 last:border-0"
                  >
                    <div>
                      <span className="font-medium text-white">{s.title}</span>
                      <span className="text-slate-500 ml-2">({s.mode})</span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-400">
                      {s.segmentsProcessed || 0} segments · {s.clipsGenerated || 0} clips
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

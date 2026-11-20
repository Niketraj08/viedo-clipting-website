import { ArrowRight, Check, Film, Languages, Radio, Scissors, Sliders, Video } from 'lucide-react';

export default function LandingPage({ user, onOpenAuth, onEnterWorkspace }) {
  const handlePrimaryAction = () => {
    if (user) {
      onEnterWorkspace();
    } else {
      onOpenAuth('register');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090F] text-slate-100">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#09090F]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
          >
            ClipForge AI
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#workflow" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Workflow
            </a>
            <a href="#livestream" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Livestream
            </a>
            <a href="#pricing" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="neon-accent-btn text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-all whitespace-nowrap shrink-0"
            >
              {user ? 'Open Studio' : 'Start Clipping Free'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-medium text-violet-400 mb-3">
                Multimodal Video Intelligence · FFmpeg 1080p Rendering
              </p>
              <h1
                className="font-display font-extrabold tracking-tight text-white leading-[1.08] mb-6"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)', textWrap: 'balance' }}
              >
                Turn long videos and livestreams into{' '}
                <span className="neon-text-gradient">viral shorts</span>
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl mb-8">
                Paste a stream URL or upload your raw recording. ClipForge AI watches every frame,
                detects high-retention moments, frames facecam-over-gameplay split screens, burns
                word-by-word English, Hindi, or Hinglish captions, and exports 1080p MP4 files.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-8">
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="neon-accent-btn text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span>{user ? 'Go to Dashboard' : 'Create Free Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {!user && (
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login')}
                    className="text-sm font-semibold text-slate-200 hover:text-white px-5 py-3 rounded-xl border border-white/15 hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                  >
                    Sign In
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                <span>9:16, 1:1 &amp; 16:9 Exports</span>
                <span aria-hidden="true">·</span>
                <span>English, Hindi &amp; Hinglish CC</span>
                <span aria-hidden="true">·</span>
                <span>120 Free Starter Credits</span>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#12131F] min-h-[300px] flex items-center justify-center">
                <img
                  src="/src/assets/images/hero_studio_preview_1795163721264.jpg"
                  alt="ClipForge AI video production studio showing vertical short-form framing"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090F]/90 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-200">
                  <span className="font-semibold text-white">
                    Automated Split-Screen &amp; Active Speaker Framing
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">1080x1920 · 30fps · H.264</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column summary strip */}
          <div className="mt-14 pt-10 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">1080p</div>
              <div className="text-sm text-slate-400 mt-1">True FFmpeg MP4 &amp; SRT export</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">3 Scripts</div>
              <div className="text-sm text-slate-400 mt-1">English, Hindi Devanagari &amp; Hinglish</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">Split 40/60</div>
              <div className="text-sm text-slate-400 mt-1">Facecam top + Gameplay bottom crop</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">15s Loops</div>
              <div className="text-sm text-slate-400 mt-1">Near real-time livestream clipping</div>
            </div>
          </div>
        </section>

        {/* Capabilities Bento Grid */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
              Engineered for creators, podcasters, and gaming channels
            </h2>
            <p className="text-slate-400 text-base">
              Every highlight goes through multimodal vision analysis, word-level speech
              alignment, spatial region cropping, and hardware-standard MP4 encoding.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 rounded-2xl bg-[#12131F] border border-white/10 p-7 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300 mb-5">
                  <Film className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Automatic Facecam &amp; Gameplay Split-Screen
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                  Gemini Vision locates the streamer webcam overlay and the primary gameplay
                  viewport, then FFmpeg stacks the facecam across the top 40% and full-motion
                  gameplay across the bottom 60% of a 1080x1920 vertical canvas.
                </p>
              </div>
              <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>Podcast Active-Speaker Tracking</span>
                <span aria-hidden="true">·</span>
                <span>Interactive Crop Box Editor</span>
                <span aria-hidden="true">·</span>
                <span>9:16, 1:1 &amp; 16:9 Presets</span>
              </div>
            </div>

            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 mb-5">
                <Languages className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                English, Hindi &amp; Hinglish Word-Level CC
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Generates synchronized word-by-word animated ASS subtitles with active keyword
                color pops, full Devanagari font rendering, and downloadable SRT files.
              </p>
            </div>

            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300 mb-5">
                <Scissors className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                AI Hooks, Viral Scores &amp; Metadata
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Every extracted clip arrives with a scroll-stopping opening hook, CTR-focused title,
                social description, hashtags, and viral score breakdown.
              </p>
            </div>

            <div className="md:col-span-2 rounded-2xl bg-[#12131F] border border-white/10 p-7 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 mb-5">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Built-in Clip Editor &amp; Instant FFmpeg Re-Render
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                  Fine-tune start/end trim timestamps, adjust facecam and gameplay crop coordinates,
                  switch caption languages or styles, mix voice and background music volume, and
                  re-render crisp 1080p MP4 files on demand.
                </p>
              </div>
              <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>4 Animated Caption Themes</span>
                <span aria-hidden="true">·</span>
                <span>Audio Fade Transitions</span>
                <span aria-hidden="true">·</span>
                <span>Inline Transcript Editing</span>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-5 flex">
              <div className="w-full rounded-2xl overflow-hidden border border-white/10 bg-[#12131F] min-h-[320px]">
                <img
                  src="/src/assets/images/feature_splitscreen_showcase_1795163721540.jpg"
                  alt="Dual camera podcast and gaming creator studio setup"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-8">
                Four steps from raw VOD to ready-to-publish shorts
              </h2>

              <div className="space-y-6">
                <div className="pb-6 border-b border-white/10">
                  <h3 className="text-base font-semibold text-white mb-1">
                    01. Upload Video or Connect Authorized Stream
                  </h3>
                  <p className="text-sm text-slate-400">
                    Upload MP4, MOV, or WebM files up to 500 MB, ingest direct HLS/MP4 VOD URLs,
                    or generate a real sample gaming/podcast VOD in one click.
                  </p>
                </div>

                <div className="pb-6 border-b border-white/10">
                  <h3 className="text-base font-semibold text-white mb-1">
                    02. Gemini Vision Watches &amp; Scores Moments
                  </h3>
                  <p className="text-sm text-slate-400">
                    Multimodal AI identifies peak reactions, punchlines, and insights with exact
                    start/end timestamps while locating facecam and gameplay coordinates.
                  </p>
                </div>

                <div className="pb-6 border-b border-white/10">
                  <h3 className="text-base font-semibold text-white mb-1">
                    03. Automatic Split-Screen &amp; Word-Level Subtitles
                  </h3>
                  <p className="text-sm text-slate-400">
                    FFmpeg crops, stacks, and renders animated word-by-word captions in English,
                    Hindi, or Hinglish placed in the visual safe area.
                  </p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    04. Refine in Editor &amp; Export Real 1080p MP4 + SRT
                  </h3>
                  <p className="text-sm text-slate-400">
                    Preview every clip, tweak trims or caption styling, re-render anytime, and
                    download broadcast-ready MP4 and SRT files.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Livestream & Creator Proof */}
        <section id="livestream" className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <div className="rounded-2xl bg-[#12131F] border border-white/10 p-8 lg:p-10 mb-14 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 mb-3">
                <Radio className="w-4 h-4" />
                <span>Near Real-Time Livestream Clipping</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Auto-clip live broadcasts as highlights happen
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Connect an authorized HLS (.m3u8) live feed or launch Browser Studio Capture
                directly from your webcam or screen share. Segments are analyzed every 15 seconds
                and viral moments render into 9:16 shorts automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="neon-accent-btn text-white text-sm font-semibold px-6 py-3 rounded-xl whitespace-nowrap shrink-0 inline-flex items-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>Launch Live Studio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7">
              <p className="text-sm text-slate-200 leading-relaxed mb-6">
                &ldquo;We switched our two-hour Hindi-English tech podcast to ClipForge AI. Instead
                of spending four hours manually reframing speakers and typing Hinglish captions,
                we export 5 ready-to-post Reels in under six minutes.&rdquo;
              </p>
              <div className="flex items-center gap-4">
                <img
                  src="/src/assets/images/avatar_creator_1_1795163721383.jpg"
                  alt="Maya Kapoor"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover border border-white/15"
                />
                <div>
                  <div className="text-sm font-semibold text-white">Maya Kapoor</div>
                  <div className="text-xs text-slate-400">
                    Host, Signal &amp; Craft Podcast · 3.4x Weekly Shorts Output
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7">
              <p className="text-sm text-slate-200 leading-relaxed mb-6">
                &ldquo;The automatic facecam-on-top, gameplay-on-bottom split screen with centered
                captions completely eliminated our manual Premiere templates during tournament
                streams.&rdquo;
              </p>
              <div className="flex items-center gap-4">
                <img
                  src="/src/assets/images/avatar_creator_2_1795163721352.jpg"
                  alt="Devon Brooks"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover border border-white/15"
                />
                <div>
                  <div className="text-sm font-semibold text-white">Devon Brooks</div>
                  <div className="text-xs text-slate-400">
                    Competitive FPS Streamer · 420K Subscribers
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <div className="max-w-xl mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
              Predictable credit-based rendering
            </h2>
            <p className="text-slate-400 text-base">
              Start free with 120 credits. Upgrade anytime as your channel scales.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-slate-400 mb-1">For solo creators testing AI clips</div>
                <h3 className="text-xl font-bold text-white mb-4">Starter</h3>
                <div className="text-3xl font-extrabold text-white font-mono tabular-nums mb-6">
                  $0 <span className="text-sm font-normal text-slate-400">/ 120 credits</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-300 mb-8">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Up to 500 MB uploads &amp; direct VOD URLs</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>English, Hindi &amp; Hinglish word-level CC</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>1080p MP4 &amp; SRT export without watermark</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="w-full py-2.5 px-4 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-semibold text-white transition-colors"
              >
                Start Free
              </button>
            </div>

            <div className="rounded-2xl bg-[#161829] border border-violet-500/50 p-7 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-violet-300 mb-1">For daily Shorts &amp; Reels channels</div>
                <h3 className="text-xl font-bold text-white mb-4">Creator Pro</h3>
                <div className="text-3xl font-extrabold text-white font-mono tabular-nums mb-6">
                  $19 <span className="text-sm font-normal text-slate-400">/ 600 credits/mo</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-200 mb-8">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>600 monthly AI processing &amp; render credits</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Facecam/gameplay split-screen detection</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Unlimited FFmpeg editor re-renders</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="w-full neon-accent-btn py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all"
              >
                Choose Creator Pro
              </button>
            </div>

            <div className="rounded-2xl bg-[#12131F] border border-white/10 p-7 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-slate-400 mb-1">For livestreamers &amp; media teams</div>
                <h3 className="text-xl font-bold text-white mb-4">Studio Live</h3>
                <div className="text-3xl font-extrabold text-white font-mono tabular-nums mb-6">
                  $49 <span className="text-sm font-normal text-slate-400">/ 2,500 credits/mo</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-300 mb-8">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>2,500 monthly credits for heavy VOD &amp; live runs</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Continuous HLS &amp; Live Capture auto-clipping</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Priority multi-clip batch export</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="w-full py-2.5 px-4 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-semibold text-white transition-colors"
              >
                Choose Studio Live
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="font-semibold text-slate-300">ClipForge AI</div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-slate-300 transition-colors">
              Features
            </a>
            <a href="#workflow" className="hover:text-slate-300 transition-colors">
              Workflow
            </a>
            <a href="#pricing" className="hover:text-slate-300 transition-colors">
              Pricing
            </a>
          </div>
          <div>© 2026 ClipForge AI. Built with Gemini AI &amp; FFmpeg.</div>
        </div>
      </footer>
    </div>
  );
}

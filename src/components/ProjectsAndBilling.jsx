import { useEffect, useState } from 'react';
import { Check, FolderOpen, Key, Search, Trash2 } from 'lucide-react';
import { apiRequest, formatSeconds } from '../lib/api.js';

export function MyProjectsView({ onOpenProject, onNewProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/projects');
      setProjects(data.projects || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    await apiRequest(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || (p.title || '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Projects &amp; History</h1>
          <p className="text-sm text-slate-400 mt-1">
            Reopen any processed VOD, inspect AI diagnostics, or manage clips.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter projects..."
              className="rounded-lg bg-[#12131F] border border-white/10 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>
          <button
            type="button"
            onClick={onNewProject}
            className="neon-accent-btn px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
          >
            New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-[#12131F] border border-white/10 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#12131F] border border-white/10 p-12 text-center">
          <FolderOpen className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">No projects yet</h3>
          <p className="text-sm text-slate-400 mb-5">
            Start a new project to analyze videos with Gemini AI and render 1080p MP4 shorts.
          </p>
          <button
            type="button"
            onClick={onNewProject}
            className="neon-accent-btn px-5 py-2.5 rounded-xl text-xs font-semibold text-white"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#12131F] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-3.5 px-5 font-medium">Project</th>
                  <th className="py-3.5 px-4 font-medium">Source</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-4 font-medium text-right">Duration</th>
                  <th className="py-3.5 px-4 font-medium text-right">Clips</th>
                  <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        {p.thumbUrl ? (
                          <img
                            src={p.thumbUrl}
                            alt={p.title}
                            referrerPolicy="no-referrer"
                            className="w-12 h-8 rounded object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-8 rounded bg-[#09090F] border border-white/10 shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold text-white">{p.title}</div>
                          <div className="text-slate-500">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 capitalize">
                      {String(p.sourceType || 'upload').replace('_', ' ')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-medium capitalize ${
                          p.status === 'completed'
                            ? 'text-emerald-400'
                            : p.status === 'failed'
                            ? 'text-red-400'
                            : 'text-violet-300'
                        }`}
                      >
                        {p.status} ({p.progress || 0}%)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {p.duration ? formatSeconds(p.duration) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-white font-semibold">
                      {p.clipsCount || 0}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(p.id)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          aria-label="Delete project"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function BillingView({ user, onUserUpdated }) {
  const [transactions, setTransactions] = useState([]);
  const [upgrading, setUpgrading] = useState('');

  useEffect(() => {
    apiRequest('/api/auth/me')
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {});
  }, [user?.credits]);

  async function handleSelectPlan(planId) {
    setUpgrading(planId);
    try {
      const data = await apiRequest('/api/billing/upgrade', {
        method: 'POST',
        body: { plan: planId },
      });
      onUserUpdated(data.user);
      setTransactions(data.transactions || []);
    } finally {
      setUpgrading('');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Credits &amp; Subscription</h1>
          <p className="text-sm text-slate-400 mt-1">
            Current plan: <span className="text-white font-semibold capitalize">{(user?.plan || 'starter').replace('_', ' ')}</span>
          </p>
        </div>
        <div className="rounded-xl bg-[#12131F] border border-white/10 px-5 py-3">
          <div className="text-xs text-slate-400">Available Balance</div>
          <div className="text-2xl font-extrabold text-white font-mono tabular-nums">
            {user?.credits ?? 0} credits
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            id: 'starter',
            name: 'Starter',
            price: '$0',
            credits: '+120 credits',
            desc: 'Best for testing uploads and caption styles.',
          },
          {
            id: 'creator_pro',
            name: 'Creator Pro',
            price: '$19/mo',
            credits: '+600 credits',
            desc: 'Built for daily Shorts, Reels & Hinglish channels.',
          },
          {
            id: 'studio_live',
            name: 'Studio Live',
            price: '$49/mo',
            credits: '+2,500 credits',
            desc: 'High-volume VODs and continuous livestream clipping.',
          },
        ].map((p) => {
          const isCurrent = user?.plan === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between ${
                isCurrent
                  ? 'bg-[#161829] border-violet-500/60'
                  : 'bg-[#12131F] border-white/10'
              }`}
            >
              <div>
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="text-2xl font-extrabold text-white font-mono tabular-nums mt-2">
                  {p.price}{' '}
                  <span className="text-xs font-normal text-violet-300">{p.credits}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 mb-6">{p.desc}</p>
              </div>
              <button
                type="button"
                disabled={upgrading === p.id}
                onClick={() => handleSelectPlan(p.id)}
                className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                  isCurrent
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'neon-accent-btn text-white'
                }`}
              >
                {isCurrent && <Check className="w-3.5 h-3.5" />}
                <span>
                  {upgrading === p.id
                    ? 'Updating...'
                    : isCurrent
                    ? `Top Up ${p.credits}`
                    : `Activate ${p.name}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6">
        <h2 className="text-base font-bold text-white mb-4">Credit Ledger</h2>
        {transactions.length === 0 ? (
          <div className="text-xs text-slate-400">No credit transactions recorded yet.</div>
        ) : (
          <div className="divide-y divide-white/5 text-xs">
            {transactions.map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-slate-200 font-medium">{t.description}</div>
                  <div className="text-slate-500">{new Date(t.createdAt).toLocaleString()}</div>
                </div>
                <div
                  className={`font-mono tabular-nums font-semibold ${
                    t.amount >= 0 ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                >
                  {t.amount >= 0 ? `+${t.amount}` : t.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsView({ user, onUserUpdated }) {
  const [name, setName] = useState(user?.name || '');
  const [defaultLanguage, setDefaultLanguage] = useState(
    user?.settings?.defaultLanguage || 'english'
  );
  const [defaultFormat, setDefaultFormat] = useState(user?.settings?.defaultFormat || '9:16');
  const [defaultCaptionStyle, setDefaultCaptionStyle] = useState(
    user?.settings?.defaultCaptionStyle || 'neon_pop'
  );
  const [autoSplitScreen, setAutoSplitScreen] = useState(
    user?.settings?.autoSplitScreen !== false
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      const data = await apiRequest('/api/auth/settings', {
        method: 'PATCH',
        body: {
          name,
          settings: {
            defaultLanguage,
            defaultFormat,
            defaultCaptionStyle,
            autoSplitScreen,
          },
        },
      });
      onUserUpdated(data.user);
      setSavedMsg('Workspace preferences saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Account &amp; Studio Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your default export format, caption language, and environment integrations.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl bg-[#12131F] border border-white/10 p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="w-full rounded-xl bg-[#09090F]/60 border border-white/10 px-3.5 py-2.5 text-sm text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Default Caption Language
            </label>
            <select
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white"
            >
              <option value="english">English</option>
              <option value="hindi">Hindi (हिन्दी)</option>
              <option value="hinglish">Hinglish</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Default Aspect Ratio
            </label>
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value)}
              className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white"
            >
              <option value="9:16">9:16 Vertical</option>
              <option value="1:1">1:1 Square</option>
              <option value="16:9">16:9 Widescreen</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Default Caption Style
            </label>
            <select
              value={defaultCaptionStyle}
              onChange={(e) => setDefaultCaptionStyle(e.target.value)}
              className="w-full rounded-xl bg-[#09090F] border border-white/10 px-3.5 py-2.5 text-sm text-white"
            >
              <option value="neon_pop">Neon Pop</option>
              <option value="hormozi_impact">Impact Bold</option>
              <option value="bold_clean">Bold Clean</option>
              <option value="minimal_cinematic">Minimal Cinematic</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSplitScreen}
                onChange={(e) => setAutoSplitScreen(e.target.checked)}
                className="rounded accent-violet-500"
              />
              <span>Auto-enable split-screen when facecam is detected</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-emerald-400">{savedMsg}</div>
          <button
            type="submit"
            disabled={saving}
            className="neon-accent-btn px-5 py-2.5 rounded-xl text-xs font-semibold text-white"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {/* Server Environment & Integration Reference */}
      <div className="rounded-2xl bg-[#12131F] border border-white/10 p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Key className="w-4 h-4 text-violet-400" />
          <span>Backend Services &amp; Environment Configuration</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          All AI and media keys are configured strictly on the server via environment secrets (never
          exposed in browser code). Refer to <code className="text-slate-200">.env.example</code>{' '}
          for self-hosting:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
          <div className="rounded-xl bg-[#09090F] border border-white/10 p-3.5">
            <div className="font-semibold text-white">GEMINI_API_KEY</div>
            <div className="text-slate-400 mt-1">
              Powers video understanding, highlight detection, facecam/gameplay region bounds, and
              English/Hindi/Hinglish word-level captions via Google AI Studio.
            </div>
          </div>
          <div className="rounded-xl bg-[#09090F] border border-white/10 p-3.5">
            <div className="font-semibold text-white">FFmpeg + FFprobe Binary</div>
            <div className="text-slate-400 mt-1">
              Server-side media probing, 1080p H.264/AAC encoding, split-screen vstack cropping, and
              burned-in ASS subtitle animation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

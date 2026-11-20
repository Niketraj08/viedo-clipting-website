import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Film,
  FolderKanban,
  Home,
  Menu,
  Plus,
  Radio,
  Settings,
  X,
} from 'lucide-react';
import ClipGalleryView, { ClipEditorView } from './components/ClipGalleryAndEditor.jsx';
import LandingPage from './components/LandingPage.jsx';
import LivestreamStudio from './components/LivestreamStudio.jsx';
import NewProjectView from './components/NewProjectView.jsx';
import ProcessingView from './components/ProcessingView.jsx';
import { BillingView, MyProjectsView, SettingsView } from './components/ProjectsAndBilling.jsx';
import { apiRequest } from './lib/api.js';

const NAV_ITEMS = [
  { id: 'new_project', label: 'Create Clips', icon: Plus },
  { id: 'clips', label: 'Clip Gallery', icon: Film },
  { id: 'projects', label: 'My Projects', icon: FolderKanban },
  { id: 'livestream', label: 'Live Studio', icon: Radio },
  { id: 'billing', label: 'Credits & Plan', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  const [activeView, setActiveView] = useState('new_project');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [editingClip, setEditingClip] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser({ name: 'Creator Studio', credits: 120, plan: 'starter', settings: {} });
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  function navigateTo(viewId) {
    setActiveView(viewId);
    setActiveProjectId(null);
    setEditingClip(null);
    setShowOverview(false);
    setMobileMenuOpen(false);
  }

  if (!workspaceReady) {
    return (
      <div className="min-h-screen bg-[#09090F] flex items-center justify-center text-sm text-slate-400">
        Loading ClipForge AI Studio...
      </div>
    );
  }

  if (showOverview) {
    return (
      <LandingPage
        onEnterWorkspace={(targetView = 'new_project') => navigateTo(targetView)}
      />
    );
  }

  const breadcrumbLabel = editingClip
    ? `Clip Editor / ${editingClip.title}`
    : activeProjectId
    ? 'Project Pipeline'
    : NAV_ITEMS.find((i) => i.id === activeView)?.label || 'Studio';

  return (
    <div className="min-h-screen bg-[#09090F] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-white/10 bg-[#0D0E17] shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <button
            type="button"
            onClick={() => setShowOverview(true)}
            className="text-lg font-extrabold tracking-tight text-white font-display"
          >
            ClipForge AI
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = !editingClip && !activeProjectId && activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-violet-500/15 text-white border border-violet-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="rounded-xl bg-[#12131F] border border-white/10 p-3.5">
            <div className="text-xs text-slate-400">Available Credits</div>
            <div className="text-lg font-bold text-white font-mono tabular-nums mt-0.5">
              {user?.credits ?? 0}
            </div>
            <button
              type="button"
              onClick={() => navigateTo('billing')}
              className="mt-2 text-xs font-semibold text-violet-300 hover:text-violet-200"
            >
              Manage Plan
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowOverview(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Platform Overview</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-[#0D0E17] border-r border-white/10 p-4 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <span className="text-base font-extrabold text-white font-display">
                  ClipForge AI
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setShowOverview(true);
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white"
            >
              <Home className="w-4 h-4" />
              <span>Platform Overview</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090F]/90 backdrop-blur-md px-5 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-slate-400 truncate">
              Studio <span className="mx-1.5">/</span>
              <span className="text-white font-semibold">{breadcrumbLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-400 font-mono tabular-nums">
              {user?.credits ?? 0} credits
            </span>
            <button
              type="button"
              onClick={() => navigateTo('new_project')}
              className="neon-accent-btn px-3.5 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Clips</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8">
          {editingClip ? (
            <ClipEditorView
              clip={editingClip}
              onBack={() => setEditingClip(null)}
              onClipUpdated={(updated) => setEditingClip(updated)}
            />
          ) : activeProjectId ? (
            <ProcessingView
              projectId={activeProjectId}
              onBack={() => {
                setActiveProjectId(null);
                setActiveView('projects');
              }}
              onEditClip={(clip) => setEditingClip(clip)}
              onRefreshUser={refreshUser}
            />
          ) : activeView === 'new_project' ? (
            <NewProjectView
              user={user}
              onProjectStarted={(project) => setActiveProjectId(project.id)}
            />
          ) : activeView === 'clips' ? (
            <ClipGalleryView
              onSelectClip={(clip) => setEditingClip(clip)}
              onNewProject={() => navigateTo('new_project')}
            />
          ) : activeView === 'projects' ? (
            <MyProjectsView
              onOpenProject={(id) => setActiveProjectId(id)}
              onNewProject={() => navigateTo('new_project')}
            />
          ) : activeView === 'livestream' ? (
            <LivestreamStudio
              onEditClip={(clip) => setEditingClip(clip)}
              onRefreshUser={refreshUser}
            />
          ) : activeView === 'billing' ? (
            <BillingView user={user} onUserUpdated={(u) => setUser(u)} />
          ) : (
            <SettingsView user={user} onUserUpdated={(u) => setUser(u)} />
          )}
        </main>
      </div>
    </div>
  );
}

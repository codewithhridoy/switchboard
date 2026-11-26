import React from 'react';
import {
  Activity,
  Cloud,
  FolderGit2,
  GitBranch,
  Layers,
  Plus,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import { AccountProfile, SwitchboardState } from '../../shared/types';

export type ActiveTab = 'tasks' | 'projects' | 'accounts' | 'routing' | 'sync';

interface SidebarProps {
  state: SwitchboardState;
  platform: string;
  activeTab: ActiveTab;
  activeProjectId: string | null;
  onSelectTab: (tab: ActiveTab) => void;
  onSelectProject: (projectId: string | null) => void;
  onOpenAddAccount: () => void;
  onOpenSettings: () => void;
}

function getAccountDotClass(acc: AccountProfile): string {
  if (!acc.enabled) return 'disabled';
  if (acc.cooldownUntil && acc.cooldownUntil > Date.now()) return 'cooldown';
  return 'ready';
}

function formatRemaining(until?: number | null): string | null {
  if (!until) return null;
  const diff = until - Date.now();
  if (diff <= 0) return null;
  const mins = Math.ceil(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  state,
  platform,
  activeTab,
  activeProjectId,
  onSelectTab,
  onSelectProject,
  onOpenAddAccount,
  onOpenSettings,
}) => {
  const readyCount = state.accounts.filter(
    (a) => a.enabled && !(a.cooldownUntil && a.cooldownUntil > Date.now())
  ).length;
  const activeTasks = state.tasks.filter(
    (t) => t.status === 'running' || t.status === 'queued'
  ).length;
  const sortedPool = [...state.accounts].sort((a, b) => a.priority - b.priority);

  return (
    <aside className="sidebar">
      {platform === 'darwin' && <div className="sidebar-mac-drag" />}

      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <Zap size={16} strokeWidth={2.4} />
        </div>
        <div>
          <div className="brand-title">Switchboard</div>
          <div className="brand-sub">AI Multi-Account Router</div>
        </div>
      </div>

      <nav className="nav-list" aria-label="Main navigation">
        <button
          type="button"
          className={`nav-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => onSelectTab('tasks')}
        >
          <span className="nav-btn-left">
            <Layers size={15} />
            <span>Command Deck</span>
          </span>
          {activeTasks > 0 && <span className="nav-badge">{activeTasks}</span>}
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => onSelectTab('projects')}
        >
          <span className="nav-btn-left">
            <FolderGit2 size={15} />
            <span>Projects</span>
          </span>
          {state.projects.length > 0 && (
            <span className="nav-badge">{state.projects.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => onSelectTab('accounts')}
        >
          <span className="nav-btn-left">
            <Users size={15} />
            <span>Accounts & Quotas</span>
          </span>
          <span className="nav-badge">
            {readyCount}/{state.accounts.length}
          </span>
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'routing' ? 'active' : ''}`}
          onClick={() => onSelectTab('routing')}
        >
          <span className="nav-btn-left">
            <GitBranch size={15} />
            <span>Smart Routing</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => onSelectTab('sync')}
        >
          <span className="nav-btn-left">
            <Cloud size={15} />
            <span>GitHub Sync</span>
          </span>
          {state.sync.connected && (
            <span className="status-dot ready" title={`Synced as @${state.sync.username}`} />
          )}
        </button>
      </nav>

      {state.projects.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="sidebar-section-label">Workspaces</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {state.projects.slice(0, 5).map((proj) => (
              <button
                key={proj.id}
                type="button"
                className={`nav-btn ${
                  activeTab === 'tasks' && activeProjectId === proj.id ? 'active' : ''
                }`}
                style={{ padding: '6px 10px', fontSize: 12 }}
                onClick={() => {
                  onSelectProject(proj.id);
                  onSelectTab('tasks');
                }}
              >
                <span className="nav-btn-left" style={{ minWidth: 0 }}>
                  <FolderGit2 size={13} />
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {proj.name}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-label">Active Pool</div>
        <div className="pool-list scroller">
          {sortedPool.map((acc) => {
            const dot = getAccountDotClass(acc);
            const cooldownText = formatRemaining(acc.cooldownUntil);
            return (
              <div key={acc.id} className="pool-mini" title={`${acc.name} (${acc.model})`}>
                <div style={{ minWidth: 0 }}>
                  <div className="pool-mini-name">{acc.name}</div>
                  <div className="pool-mini-model">
                    {cooldownText ? `Cooldown · ${cooldownText}` : acc.model}
                  </div>
                </div>
                <span className={`status-dot ${dot}`} aria-label={dot} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            fontSize: 11.5,
            color: 'var(--text-secondary)',
          }}
        >
          <Activity size={13} />
          <span>
            {state.queueRunning
              ? 'Orchestrator running'
              : state.sync.connected && state.sync.username
                ? `@${state.sync.username}`
                : 'Queue idle'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={onOpenAddAccount}
          >
            <Plus size={14} />
            Add Account
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};

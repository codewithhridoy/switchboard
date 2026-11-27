import React from 'react';
import { AlertTriangle, FolderPlus, Plus, Settings } from 'lucide-react';
import { ActiveTab } from './Sidebar';

const TAB_HEADERS: Record<ActiveTab, { title: string; subtitle: string }> = {
  tasks: {
    title: 'Command Deck',
    subtitle: 'Queue tasks, keep multi-turn project chats, and fail over automatically on quota limits.',
  },
  projects: {
    title: 'Projects',
    subtitle: 'Create new repositories, import folders, and keep persistent multi-model threads per project.',
  },
  accounts: {
    title: 'Accounts & Quotas',
    subtitle: 'Connect Claude Team, Claude Personal, Google AI Pro (agy), Codex, and API keys.',
  },
  usage: {
    title: 'Usage & Limits',
    subtitle: 'Track 5-hour session, daily, and weekly token usage with configurable auto-switch caps.',
  },
  routing: {
    title: 'Smart Routing',
    subtitle: 'Customize which model handles each task category and how failover behaves.',
  },
  sync: {
    title: 'GitHub Cloud Sync',
    subtitle: 'Back up and restore your settings, accounts, projects, and chats via a Private GitHub Gist.',
  },
};

interface TopbarProps {
  activeTab: ActiveTab;
  lastFailoverToast: string | null;
  onOpenCreateProject: () => void;
  onOpenAddAccount: () => void;
  onOpenSettings: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  activeTab,
  lastFailoverToast,
  onOpenCreateProject,
  onOpenAddAccount,
  onOpenSettings,
}) => {
  const header = TAB_HEADERS[activeTab];

  return (
    <header className="topbar">
      <div className="topbar-title-group">
        <h1>{header.title}</h1>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{header.subtitle}</span>
      </div>

      <div className="topbar-actions">
        {lastFailoverToast && (
          <div className="pill pill-warning" role="status" aria-live="polite">
            <AlertTriangle size={12} />
            <span>{lastFailoverToast}</span>
          </div>
        )}
        <button type="button" className="btn btn-sm" onClick={onOpenCreateProject}>
          <FolderPlus size={13} /> New Project
        </button>
        <button type="button" className="btn btn-sm" onClick={onOpenAddAccount}>
          <Plus size={13} /> Account
        </button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Open settings" onClick={onOpenSettings}>
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};

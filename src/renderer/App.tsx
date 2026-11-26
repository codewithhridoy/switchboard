import React, { useEffect, useState } from 'react';
import { AlertTriangle, FolderPlus, Plus, Settings } from 'lucide-react';
import { AccountsView } from './components/AccountsView';
import { AddAccountDialog } from './components/AddAccountDialog';
import { CommandDeck } from './components/CommandDeck';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { ProjectsView } from './components/ProjectsView';
import { RoutingView } from './components/RoutingView';
import { SettingsDialog } from './components/SettingsDialog';
import { ActiveTab, Sidebar } from './components/Sidebar';
import { SyncView } from './components/SyncView';
import { useSwitchboard } from './hooks/useSwitchboard';
import { applyThemePreference, getStoredTheme } from './utils/theme';

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
  routing: {
    title: 'Smart Routing',
    subtitle: 'Customize which model handles each task category and how failover behaves.',
  },
  sync: {
    title: 'GitHub Cloud Sync',
    subtitle: 'Back up and restore your settings, accounts, projects, and chats via a Private GitHub Gist.',
  },
};

export const App: React.FC = () => {
  const { state, platform, lastFailoverToast, actions } = useSwitchboard();
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') {
        applyThemePreference(getStoredTheme());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!state) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        Loading Switchboard...
      </div>
    );
  }

  const header = TAB_HEADERS[activeTab];

  return (
    <div className="app-shell">
      <Sidebar
        state={state}
        platform={platform}
        activeTab={activeTab}
        activeProjectId={activeProjectId}
        onSelectTab={setActiveTab}
        onSelectProject={setActiveProjectId}
        onOpenAddAccount={() => setAddAccountOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title-group">
            <h1>{header.title}</h1>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {header.subtitle}
            </span>
          </div>

          <div className="topbar-actions">
            {lastFailoverToast && (
              <div className="pill pill-warning" role="status" aria-live="polite">
                <AlertTriangle size={12} />
                <span>{lastFailoverToast}</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setCreateProjectOpen(true)}
            >
              <FolderPlus size={13} />
              New Project
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setAddAccountOpen(true)}
            >
              <Plus size={13} />
              Account
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={15} />
            </button>
          </div>
        </header>

        <div className="view-body scroller">
          {activeTab === 'tasks' && (
            <CommandDeck
              state={state}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProjectId}
              onCreateThread={actions.createThread}
              onEnqueueTask={actions.enqueueTask}
              onRetryTask={actions.retryTask}
              onCancelTask={actions.cancelTask}
              onDeleteTask={actions.deleteTask}
              onPickFolder={actions.pickFolder}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectsView
              state={state}
              onOpenCreateProject={() => setCreateProjectOpen(true)}
              onImportFolder={async () => {
                const folder = await actions.pickFolder();
                if (folder) {
                  const imported = await actions.importProject({
                    path: folder,
                    scope: 'personal',
                  });
                  if (imported) setActiveProjectId(imported.id);
                }
              }}
              onOpenProjectInDeck={(projId) => {
                setActiveProjectId(projId);
                setActiveTab('tasks');
              }}
              onPushToGitHub={async (projId, isPrivate) => {
                await actions.pushProjectToGitHub(projId, isPrivate);
              }}
              onDeleteProject={async (projId) => {
                if (activeProjectId === projId) setActiveProjectId(null);
                await actions.deleteProject(projId);
              }}
              onOpenExternal={actions.openExternal}
            />
          )}
          {activeTab === 'accounts' && (
            <AccountsView
              state={state}
              onAddAccount={() => setAddAccountOpen(true)}
              onUpdateAccount={actions.updateAccount}
              onDeleteAccount={actions.deleteAccount}
              onClearCooldown={actions.clearCooldown}
              onTestAccount={actions.testAccount}
              onLaunchCliLogin={actions.launchCliLogin}
              onRefreshCliHealth={actions.refreshCliHealth}
            />
          )}
          {activeTab === 'routing' && (
            <RoutingView state={state} onUpdateRule={actions.updateRoutingRule} />
          )}
          {activeTab === 'sync' && (
            <SyncView
              state={state}
              onConnectGitHub={actions.connectGitHub}
              onDisconnectGitHub={actions.disconnectGitHub}
              onUpdateSyncSettings={actions.updateSyncSettings}
              onPushSyncNow={actions.pushSyncNow}
              onPullSyncNow={actions.pullSyncNow}
              onOpenExternal={actions.openExternal}
            />
          )}
        </div>
      </main>

      <AddAccountDialog
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onCreate={actions.addAccount}
      />

      <CreateProjectDialog
        open={createProjectOpen}
        defaultParentDir={state.settings.defaultWorkspaceDir}
        githubConnected={state.sync.connected}
        githubUsername={state.sync.username}
        onClose={() => setCreateProjectOpen(false)}
        onPickFolder={actions.pickFolder}
        onCreate={async (input) => {
          const created = await actions.createProject(input);
          if (created) {
            setActiveProjectId(created.id);
            setActiveTab('tasks');
          }
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={state.settings}
        onClose={() => setSettingsOpen(false)}
        onSave={actions.updateSettings}
        onPickFolder={actions.pickFolder}
      />
    </div>
  );
};

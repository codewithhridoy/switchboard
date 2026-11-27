import React, { useEffect, useState } from 'react';
import { AccountsView } from './components/AccountsView';
import { AddAccountDialog } from './components/AddAccountDialog';
import { CloneRepoDialog } from './components/CloneRepoDialog';
import { CommandDeck } from './components/CommandDeck';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { ProjectsView } from './components/ProjectsView';
import { RoutingView } from './components/RoutingView';
import { SettingsDialog } from './components/SettingsDialog';
import { ActiveTab, Sidebar } from './components/Sidebar';
import { SyncView } from './components/SyncView';
import { Topbar } from './components/Topbar';
import { UsageView } from './components/UsageView';
import { useSwitchboard } from './hooks/useSwitchboard';
import { applyThemePreference, getStoredTheme } from './utils/theme';

export const App: React.FC = () => {
  const { state, platform, lastFailoverToast, actions } = useSwitchboard();
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [cloneRepoOpen, setCloneRepoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') applyThemePreference(getStoredTheme());
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
        <Topbar
          activeTab={activeTab}
          lastFailoverToast={lastFailoverToast}
          onOpenCreateProject={() => setCreateProjectOpen(true)}
          onOpenAddAccount={() => setAddAccountOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="view-body scroller">
          {activeTab === 'tasks' && (
            <CommandDeck
              state={state}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProjectId}
              onCreateThread={actions.createThread}
              onDeleteThread={actions.deleteThread}
              onEnqueueTask={actions.enqueueTask}
              onRetryTask={actions.retryTask}
              onCancelTask={actions.cancelTask}
              onDeleteTask={actions.deleteTask}
              onPickFolder={actions.pickFolder}
              onPickFiles={actions.pickFiles}
              onSaveAttachment={actions.saveAttachment}
              onGitStatus={actions.gitStatus}
              onGitFileDiff={actions.gitFileDiff}
              onGitCheckout={actions.gitCheckout}
              onGitDiscardFile={actions.gitDiscardFile}
              onGitCommitAll={actions.gitCommitAll}
              onGitPush={actions.gitPush}
              onGitCreatePr={actions.gitCreatePr}
              onGitGetCurrentPr={actions.gitGetCurrentPr}
              onGitMergePr={actions.gitMergePr}
              onOpenExternal={actions.openExternal}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectsView
              state={state}
              onOpenCreateProject={() => setCreateProjectOpen(true)}
              onOpenCloneRepo={() => setCloneRepoOpen(true)}
              onImportFolder={async () => {
                const folder = await actions.pickFolder();
                if (folder) {
                  const imported = await actions.importProject({ path: folder, scope: 'personal' });
                  if (imported) setActiveProjectId(imported.id);
                }
              }}
              onOpenProjectInDeck={(id) => { setActiveProjectId(id); setActiveTab('tasks'); }}
              onPushToGitHub={async (id, priv) => { await actions.pushProjectToGitHub(id, priv); }}
              onDeleteProject={async (id) => {
                if (activeProjectId === id) setActiveProjectId(null);
                await actions.deleteProject(id);
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
          {activeTab === 'usage' && (
            <UsageView state={state} onRefreshUsage={actions.refreshUsage} onUpdateAccount={actions.updateAccount} />
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

      <AddAccountDialog open={addAccountOpen} onClose={() => setAddAccountOpen(false)} onCreate={actions.addAccount} />
      <CreateProjectDialog
        open={createProjectOpen}
        defaultParentDir={state.settings.defaultWorkspaceDir}
        githubConnected={state.sync.connected}
        githubUsername={state.sync.username}
        onClose={() => setCreateProjectOpen(false)}
        onPickFolder={actions.pickFolder}
        onCreate={async (input) => {
          const created = await actions.createProject(input);
          if (created) { setActiveProjectId(created.id); setActiveTab('tasks'); }
        }}
      />
      <CloneRepoDialog
        open={cloneRepoOpen}
        defaultParentDir={state.settings.defaultWorkspaceDir}
        githubConnected={state.sync.connected}
        githubUsername={state.sync.username}
        onClose={() => setCloneRepoOpen(false)}
        onPickFolder={actions.pickFolder}
        onListGitHubRepos={actions.listGitHubRepos}
        onClone={async (input) => {
          const cloned = await actions.cloneRepoProject(input);
          if (cloned) { setActiveProjectId(cloned.id); setActiveTab('tasks'); }
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

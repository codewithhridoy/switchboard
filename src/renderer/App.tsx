import React, { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Settings } from 'lucide-react';
import { AccountsView } from './components/AccountsView';
import { AddAccountDialog } from './components/AddAccountDialog';
import { CommandDeck } from './components/CommandDeck';
import { RoutingView } from './components/RoutingView';
import { SettingsDialog } from './components/SettingsDialog';
import { ActiveTab, Sidebar } from './components/Sidebar';
import { useSwitchboard } from './hooks/useSwitchboard';
import { applyThemePreference, getStoredTheme } from './utils/theme';

const TAB_HEADERS: Record<ActiveTab, { title: string; subtitle: string }> = {
  tasks: {
    title: 'Command Deck',
    subtitle: 'Queue tasks, watch auto-routing live, and fail over automatically on quota limits.',
  },
  accounts: {
    title: 'Accounts & Quotas',
    subtitle: 'Connect Claude Personal, Claude Team, Google AI Pro (Gemini CLI), Codex, and API keys.',
  },
  routing: {
    title: 'Smart Routing',
    subtitle: 'Customize which model handles each task category and how failover behaves.',
  },
};

export const App: React.FC = () => {
  const { state, platform, lastFailoverToast, actions } = useSwitchboard();
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync theme override across windows/tabs via storage event
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
        onSelectTab={setActiveTab}
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
              onEnqueueTask={actions.enqueueTask}
              onRetryTask={actions.retryTask}
              onCancelTask={actions.cancelTask}
              onDeleteTask={actions.deleteTask}
              onPickFolder={actions.pickFolder}
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
        </div>
      </main>

      <AddAccountDialog
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onCreate={actions.addAccount}
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

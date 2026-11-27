import React, { useState } from 'react';
import { CheckCircle2, Cloud, ShieldCheck, XCircle } from 'lucide-react';
import { GitHubSyncConfig, SwitchboardState } from '../../shared/types';
import { GitHubConnectCards } from './sync/GitHubConnectCards';
import { GitHubConnectedCard } from './sync/GitHubConnectedCard';

interface SyncViewProps {
  state: SwitchboardState;
  onConnectGitHub: (opts: { authMode: 'gh-cli' | 'pat'; patToken?: string }) => Promise<GitHubSyncConfig>;
  onDisconnectGitHub: () => Promise<void>;
  onUpdateSyncSettings: (
    patch: Partial<Pick<GitHubSyncConfig, 'autoSync' | 'includeTasks' | 'encryptSecrets'>>
  ) => Promise<void>;
  onPushSyncNow: (passphrase?: string) => Promise<{ gistUrl: string; syncedAt: number }>;
  onPullSyncNow: (passphrase?: string) => Promise<{
    restoredAccounts: number;
    restoredProjects: number;
    restoredTasks: number;
  }>;
  onOpenExternal: (url: string) => Promise<void>;
}

export const SyncView: React.FC<SyncViewProps> = ({
  state,
  onConnectGitHub,
  onDisconnectGitHub,
  onUpdateSyncSettings,
  onPushSyncNow,
  onPullSyncNow,
  onOpenExternal,
}) => {
  const { sync } = state;
  const [patInput, setPatInput] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState<'connect-gh' | 'connect-pat' | 'push' | 'pull' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const handleConnect = async (mode: 'gh-cli' | 'pat') => {
    setBusy(mode === 'gh-cli' ? 'connect-gh' : 'connect-pat');
    setNotice(null);
    try {
      const res = await onConnectGitHub({ authMode: mode, patToken: patInput });
      setPatInput('');
      setNotice({
        ok: true,
        text: `Connected to GitHub as @${res.username}.${res.gistUrl ? ' Existing Switchboard backup found — click Restore to pull it!' : ''}`,
      });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handlePush = async () => {
    setBusy('push');
    setNotice(null);
    try {
      const res = await onPushSyncNow(sync.encryptSecrets ? passphrase : undefined);
      setNotice({ ok: true, text: `Synced to your private GitHub Gist at ${new Date(res.syncedAt).toLocaleTimeString()}.` });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handlePull = async () => {
    setBusy('pull');
    setNotice(null);
    try {
      const res = await onPullSyncNow(passphrase || undefined);
      setNotice({
        ok: true,
        text: `Restored ${res.restoredAccounts} account(s), ${res.restoredProjects} project(s), and ${res.restoredTasks} task/chat turn(s).`,
      });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <ShieldCheck size={20} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>
            Zero-Server Private Cloud Sync via Your GitHub Account:
          </strong>{' '}
          Switchboard saves your settings, routing rules, connected account definitions, projects,
          and chat history to a <strong>Private GitHub Gist</strong> owned by you. Raw CLI login
          tokens are never uploaded, and API keys are excluded by default (or optionally AES-256-GCM
          encrypted with your passphrase).
        </div>
      </div>

      {!sync.connected ? (
        <GitHubConnectCards patInput={patInput} busy={busy} onChangePat={setPatInput} onConnect={handleConnect} />
      ) : (
        <GitHubConnectedCard
          sync={sync}
          passphrase={passphrase}
          busy={busy}
          onChangePassphrase={setPassphrase}
          onUpdateSyncSettings={onUpdateSyncSettings}
          onDisconnect={onDisconnectGitHub}
          onPush={handlePush}
          onPull={handlePull}
          onOpenExternal={onOpenExternal}
        />
      )}

      {(notice || sync.lastError) && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: notice && !notice.ok ? 'var(--danger)' : !notice && sync.lastError ? 'var(--danger)' : 'var(--success)',
            fontSize: 12.5,
          }}
        >
          {notice?.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          <span>{notice?.text ?? sync.lastError}</span>
        </div>
      )}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        <Cloud size={15} />
        <span>
          Moving to a new Mac, Linux, or Windows PC? Install Switchboard, connect your GitHub
          account here, click <strong>Restore from GitHub</strong>, and all your accounts, routing
          rules, projects, and chat threads appear instantly.
        </span>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Github,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { GitHubSyncConfig, SwitchboardState } from '../../shared/types';

interface SyncViewProps {
  state: SwitchboardState;
  onConnectGitHub: (opts: {
    authMode: 'gh-cli' | 'pat';
    patToken?: string;
  }) => Promise<GitHubSyncConfig>;
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
        text: `Connected to GitHub as @${res.username}.${
          res.gistUrl ? ' Existing Switchboard backup found — click Restore to pull it!' : ''
        }`,
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
      setNotice({
        ok: true,
        text: `Synced to your private GitHub Gist at ${new Date(res.syncedAt).toLocaleTimeString()}.`,
      });
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
          Switchboard saves your settings, routing rules, connected account definitions, projects, and chat history to a <strong>Private GitHub Gist</strong> owned by you. Raw CLI login tokens are never uploaded, and API keys are excluded by default (or optionally AES-256-GCM encrypted with your passphrase).
        </div>
      </div>

      {!sync.connected ? (
        <div className="grid-2">
          <div className="card account-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={17} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: 14 }}>1-Click via GitHub CLI (`gh`)</strong>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Recommended if you already have `gh` signed in on your Mac, Linux, or Windows machine. Uses your existing GitHub CLI session with zero copy-paste.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 'auto' }}
              disabled={busy !== null}
              onClick={() => void handleConnect('gh-cli')}
            >
              {busy === 'connect-gh' ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Github size={14} />
              )}
              Connect with GitHub CLI
            </button>
          </div>

          <div className="card account-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={17} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: 14 }}>Connect with Personal Access Token</strong>
            </div>
            <div className="field">
              <label htmlFor="gh-pat">GitHub Token (`gist` + `repo` scopes)</label>
              <span className="field-hint">
                Stored only locally in ~/.switchboard/state.json.
              </span>
              <input
                id="gh-pat"
                type="password"
                className="input-field mono"
                placeholder="ghp_..."
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={!patInput.trim() || busy !== null}
              onClick={() => void handleConnect('pat')}
            >
              {busy === 'connect-pat' ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Github size={14} />
              )}
              Connect with Token
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {sync.avatarUrl ? (
                  <img
                    src={sync.avatarUrl}
                    alt={sync.username}
                    width={40}
                    height={40}
                    style={{ borderRadius: 999, border: '1px solid var(--border-strong)' }}
                  />
                ) : (
                  <div className="brand-mark">
                    <Github size={18} />
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 15 }}>@{sync.username}</strong>
                    <span className="pill pill-success">Connected ({sync.authMode})</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {sync.lastSyncedAt
                      ? `Last synced (${sync.lastSyncDirection ?? 'push'}): ${new Date(sync.lastSyncedAt).toLocaleString()}`
                      : 'Not synced yet — click Push Backup Now to create your private cloud backup.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {sync.gistUrl && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void onOpenExternal(sync.gistUrl!)}
                  >
                    <ExternalLink size={13} />
                    View Private Gist
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => void onDisconnectGitHub()}
                >
                  <LogOut size={13} />
                  Disconnect
                </button>
              </div>
            </div>

            <div className="account-meta-box" style={{ gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={sync.autoSync}
                  disabled={sync.encryptSecrets}
                  onChange={(e) => void onUpdateSyncSettings({ autoSync: e.target.checked })}
                />
                <span>
                  <strong>Auto-sync changes</strong> (automatically backs up to your private Gist 5 seconds after settings, projects, or chats update)
                </span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={sync.includeTasks}
                  onChange={(e) => void onUpdateSyncSettings({ includeTasks: e.target.checked })}
                />
                <span>
                  <strong>Include project chats & task history</strong> (syncs your last 60 multi-turn conversations)
                </span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={sync.encryptSecrets}
                  onChange={(e) =>
                    void onUpdateSyncSettings({
                      encryptSecrets: e.target.checked,
                      autoSync: e.target.checked ? false : sync.autoSync,
                    })
                  }
                />
                <Lock size={13} />
                <span>
                  <strong>Encrypt API keys with passphrase (AES-256-GCM)</strong> (when unchecked, API keys stay strictly local)
                </span>
              </label>

              {sync.encryptSecrets && (
                <div className="field" style={{ paddingLeft: 24, maxWidth: 380 }}>
                  <label htmlFor="sync-pass">Encryption / Decryption Passphrase</label>
                  <input
                    id="sync-pass"
                    type="password"
                    className="input-field"
                    placeholder="Minimum 4 characters"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void handlePush()}
              >
                {busy === 'push' ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <CloudUpload size={14} />
                )}
                Push Backup Now
              </button>

              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => void handlePull()}
              >
                {busy === 'pull' ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <CloudDownload size={14} />
                )}
                Restore from GitHub
              </button>
            </div>
          </div>
        </>
      )}

      {(notice || sync.lastError) && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color:
              notice && !notice.ok
                ? 'var(--danger)'
                : !notice && sync.lastError
                  ? 'var(--danger)'
                  : 'var(--success)',
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
          Moving to a new Mac, Linux, or Windows PC? Install Switchboard, connect your GitHub account here, click <strong>Restore from GitHub</strong>, and all your accounts, routing rules, projects, and chat threads appear instantly.
        </span>
      </div>
    </div>
  );
};

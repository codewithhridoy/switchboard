import React from 'react';
import { CloudDownload, CloudUpload, ExternalLink, Github, Loader2, Lock, LogOut } from 'lucide-react';
import { GitHubSyncConfig } from '../../../shared/types';

interface GitHubConnectedCardProps {
  sync: GitHubSyncConfig;
  passphrase: string;
  busy: 'connect-gh' | 'connect-pat' | 'push' | 'pull' | null;
  onChangePassphrase: (val: string) => void;
  onUpdateSyncSettings: (
    patch: Partial<Pick<GitHubSyncConfig, 'autoSync' | 'includeTasks' | 'encryptSecrets'>>
  ) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onPush: () => Promise<void>;
  onPull: () => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

export const GitHubConnectedCard: React.FC<GitHubConnectedCardProps> = ({
  sync,
  passphrase,
  busy,
  onChangePassphrase,
  onUpdateSyncSettings,
  onDisconnect,
  onPush,
  onPull,
  onOpenExternal,
}) => (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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
          <button type="button" className="btn btn-sm" onClick={() => void onOpenExternal(sync.gistUrl!)}>
            <ExternalLink size={13} /> View Private Gist
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => void onDisconnect()}>
          <LogOut size={13} /> Disconnect
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
          <strong>Auto-sync changes</strong> (automatically backs up to your private Gist 5 seconds
          after settings, projects, or chats update)
        </span>
      </label>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
        <input
          type="checkbox"
          checked={sync.includeTasks}
          onChange={(e) => void onUpdateSyncSettings({ includeTasks: e.target.checked })}
        />
        <span>
          <strong>Include project chats &amp; task history</strong> (syncs your last 60 multi-turn
          conversations)
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
          <strong>Encrypt API keys with passphrase (AES-256-GCM)</strong> (when unchecked, API keys
          stay strictly local)
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
            onChange={(e) => onChangePassphrase(e.target.value)}
          />
        </div>
      )}
    </div>

    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void onPush()}>
        {busy === 'push' ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />}
        Push Backup Now
      </button>
      <button type="button" className="btn" disabled={busy !== null} onClick={() => void onPull()}>
        {busy === 'pull' ? <Loader2 size={14} className="spin" /> : <CloudDownload size={14} />}
        Restore from GitHub
      </button>
    </div>
  </div>
);

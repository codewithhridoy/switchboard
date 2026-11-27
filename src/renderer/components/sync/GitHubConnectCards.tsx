import React from 'react';
import { Github, KeyRound, Loader2, Terminal } from 'lucide-react';

interface GitHubConnectCardsProps {
  patInput: string;
  busy: 'connect-gh' | 'connect-pat' | 'push' | 'pull' | null;
  onChangePat: (val: string) => void;
  onConnect: (mode: 'gh-cli' | 'pat') => Promise<void>;
}

export const GitHubConnectCards: React.FC<GitHubConnectCardsProps> = ({
  patInput,
  busy,
  onChangePat,
  onConnect,
}) => (
  <div className="grid-2">
    <div className="card account-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Terminal size={17} style={{ color: 'var(--accent)' }} />
        <strong style={{ fontSize: 14 }}>1-Click via GitHub CLI (`gh`)</strong>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
        Recommended if you already have `gh` signed in on your Mac, Linux, or Windows machine. Uses
        your existing GitHub CLI session with zero copy-paste.
      </div>
      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        disabled={busy !== null}
        onClick={() => void onConnect('gh-cli')}
      >
        {busy === 'connect-gh' ? <Loader2 size={14} className="spin" /> : <Github size={14} />}
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
        <span className="field-hint">Stored only locally in ~/.switchboard/state.json.</span>
        <input
          id="gh-pat"
          type="password"
          className="input-field mono"
          placeholder="ghp_..."
          value={patInput}
          onChange={(e) => onChangePat(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn"
        disabled={!patInput.trim() || busy !== null}
        onClick={() => void onConnect('pat')}
      >
        {busy === 'connect-pat' ? <Loader2 size={14} className="spin" /> : <Github size={14} />}
        Connect with Token
      </button>
    </div>
  </div>
);

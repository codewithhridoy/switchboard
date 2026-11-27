import React from 'react';
import { Github } from 'lucide-react';

interface ProjectGitOptionsProps {
  initGit: boolean;
  createGitHubRepo: boolean;
  githubPrivate: boolean;
  githubConnected: boolean;
  githubUsername?: string;
  onChangeInitGit: (val: boolean) => void;
  onChangeCreateGitHubRepo: (val: boolean) => void;
  onChangeGitHubPrivate: (val: boolean) => void;
}

export const ProjectGitOptions: React.FC<ProjectGitOptionsProps> = ({
  initGit,
  createGitHubRepo,
  githubPrivate,
  githubConnected,
  githubUsername,
  onChangeInitGit,
  onChangeCreateGitHubRepo,
  onChangeGitHubPrivate,
}) => (
  <div className="account-meta-box" style={{ gap: 8 }}>
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>
      <input
        type="checkbox"
        checked={initGit || createGitHubRepo}
        disabled={createGitHubRepo}
        onChange={(e) => onChangeInitGit(e.target.checked)}
      />
      Initialize local Git repository (`main` branch)
    </label>

    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>
      <input
        type="checkbox"
        checked={createGitHubRepo}
        onChange={(e) => onChangeCreateGitHubRepo(e.target.checked)}
      />
      <Github size={13} />
      Create GitHub repository &amp; push immediately
      {githubConnected && githubUsername ? ` (@${githubUsername})` : ''}
    </label>

    {createGitHubRepo && (
      <div style={{ paddingLeft: 22, display: 'flex', gap: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="radio" name="gh-visibility" checked={githubPrivate} onChange={() => onChangeGitHubPrivate(true)} />
          Private repo
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="radio" name="gh-visibility" checked={!githubPrivate} onChange={() => onChangeGitHubPrivate(false)} />
          Public (Open Source)
        </label>
      </div>
    )}
  </div>
);

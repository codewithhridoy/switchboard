import React, { useState } from 'react';
import {
  Check,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { GitHubPullRequestInfo, GitWorkspaceStatus } from '../../../shared/types';

interface GitToolbarProps {
  status: GitWorkspaceStatus;
  openPr: GitHubPullRequestInfo | null;
  loading: boolean;
  busyAction: string | null;
  onSwitchBranch: (branch: string) => Promise<void>;
  onCreateBranch: (branch: string) => Promise<void>;
  onPush: () => Promise<void>;
  onOpenCreatePr: () => void;
  onOpenMergePr: () => void;
  onRefresh: () => void;
}

export const GitToolbar: React.FC<GitToolbarProps> = ({
  status,
  openPr,
  loading,
  busyAction,
  onSwitchBranch,
  onCreateBranch,
  onPush,
  onOpenCreatePr,
  onOpenMergePr,
  onRefresh,
}) => {
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    await onCreateBranch(name);
    setNewBranchName('');
    setNewBranchOpen(false);
  };

  return (
    <div className="git-toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <GitBranch size={14} style={{ color: 'var(--accent)' }} />
        <select
          className="select-compact mono"
          aria-label="Current Git branch"
          value={status.currentBranch}
          disabled={busyAction !== null}
          onChange={(e) => void onSwitchBranch(e.target.value)}
        >
          {status.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {!newBranchOpen ? (
          <button type="button" className="btn btn-sm" onClick={() => setNewBranchOpen(true)}>
            <Plus size={12} />
            New Branch
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              className="input-field mono"
              style={{ width: 170, height: 28, fontSize: 12 }}
              placeholder="feat/my-branch"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranchName.trim()) {
                  e.preventDefault();
                  void handleCreateBranch();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!newBranchName.trim() || busyAction !== null}
              onClick={() => void handleCreateBranch()}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNewBranchOpen(false)}
            >
              <X size={12} />
            </button>
          </div>
        )}

        <span className="pill mono" style={{ color: 'var(--success)' }}>
          +{status.totalAdditions}
        </span>
        <span className="pill mono" style={{ color: 'var(--danger)' }}>
          -{status.totalDeletions}
        </span>
        {status.ahead > 0 && <span className="pill pill-accent mono">{status.ahead} ahead</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busyAction !== null}
          onClick={() => void onPush()}
        >
          {busyAction === 'push' ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
          Push
        </button>

        {openPr ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busyAction !== null}
            title={`Merge Pull Request #${openPr.number} (${openPr.headBranch} → ${openPr.baseBranch})`}
            onClick={onOpenMergePr}
          >
            <GitMerge size={12} />
            Merge PR #{openPr.number}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!status.githubFullName || busyAction !== null}
            title={
              status.githubFullName
                ? `Create Pull Request on ${status.githubFullName}`
                : 'Add a GitHub origin remote to create PRs'
            }
            onClick={onOpenCreatePr}
          >
            <GitPullRequest size={12} />
            Create PR
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          title="Refresh Git status and PR state"
          aria-label="Refresh Git status"
          onClick={onRefresh}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>
    </div>
  );
};

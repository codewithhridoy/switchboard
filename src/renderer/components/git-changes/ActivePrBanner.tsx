import React from 'react';
import { ExternalLink, GitMerge, GitPullRequest } from 'lucide-react';
import { GitHubPullRequestInfo, MergeMethod } from '../../../shared/types';

interface ActivePrBannerProps {
  pr: GitHubPullRequestInfo;
  disabled: boolean;
  onOpenExternal: (url: string) => Promise<void>;
  onRequestMerge: (method: MergeMethod) => void;
}

export const ActivePrBanner: React.FC<ActivePrBannerProps> = ({
  pr,
  disabled,
  onOpenExternal,
  onRequestMerge,
}) => {
  const blocked = disabled || pr.draft || pr.mergeable === false;
  const blockedHint = pr.draft
    ? 'Mark PR ready for review on GitHub before merging'
    : pr.mergeable === false
      ? 'Resolve merge conflicts before merging'
      : undefined;

  return (
    <div
      style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <GitPullRequest size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span className="pill pill-success mono" style={{ flexShrink: 0 }}>
          PR #{pr.number}
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={pr.title}
        >
          {pr.title}
        </span>
        <span className="pill mono" style={{ flexShrink: 0 }}>
          {pr.headBranch} → {pr.baseBranch}
        </span>
        {pr.draft && <span className="pill pill-warning">Draft</span>}
        {pr.mergeable === false && <span className="pill pill-danger">Merge Conflicts</span>}
        {typeof pr.changedFiles === 'number' && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {pr.changedFiles} files
            {typeof pr.additions === 'number' && (
              <span style={{ color: 'var(--success)', marginLeft: 5 }}>+{pr.additions}</span>
            )}
            {typeof pr.deletions === 'number' && (
              <span style={{ color: 'var(--danger)', marginLeft: 4 }}>-{pr.deletions}</span>
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button type="button" className="btn btn-sm" onClick={() => void onOpenExternal(pr.url)}>
          View on GitHub <ExternalLink size={11} />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={blocked}
          title={blockedHint || `Create a merge commit for PR #${pr.number} into ${pr.baseBranch}`}
          onClick={() => onRequestMerge('merge')}
        >
          <GitMerge size={12} />
          Merge
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={blocked}
          title={blockedHint || `Squash and merge PR #${pr.number} into ${pr.baseBranch}`}
          onClick={() => onRequestMerge('squash')}
        >
          <GitMerge size={12} />
          Squash &amp; Merge
        </button>
      </div>
    </div>
  );
};

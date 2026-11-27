import React from 'react';
import { FileDiff, GitBranch, MessageSquare } from 'lucide-react';
import { GitWorkspaceStatus } from '../../../shared/types';

interface InspectorHeaderProps {
  inspectorTab: 'response' | 'changes';
  turnCount: number;
  gitStatus: GitWorkspaceStatus | null;
  threadTitle?: string;
  onSelectResponse: () => void;
  onSelectChanges: () => void;
}

export const InspectorHeader: React.FC<InspectorHeaderProps> = ({
  inspectorTab,
  turnCount,
  gitStatus,
  threadTitle,
  onSelectResponse,
  onSelectChanges,
}) => (
  <div className="panel-header">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div className="segmented" role="tablist" aria-label="Workspace inspector view">
        <button
          type="button"
          role="tab"
          aria-selected={inspectorTab === 'response'}
          className={inspectorTab === 'response' ? 'active' : ''}
          onClick={onSelectResponse}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={12} /> Chat{turnCount > 0 ? ` (${turnCount})` : ''}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inspectorTab === 'changes'}
          className={inspectorTab === 'changes' ? 'active' : ''}
          onClick={onSelectChanges}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FileDiff size={12} /> Changes
            {gitStatus?.isGitRepo && gitStatus.files.length > 0 && (
              <span className="pill pill-accent" style={{ padding: '0 6px', fontSize: 10.5 }}>
                {gitStatus.files.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {gitStatus?.isGitRepo && (
        <span className="pill mono" title={`Current branch in ${gitStatus.cwd}`}>
          <GitBranch size={11} /> {gitStatus.currentBranch}
        </span>
      )}
    </div>

    {threadTitle && (
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 260,
        }}
        title={threadTitle}
      >
        {threadTitle}
      </span>
    )}
  </div>
);

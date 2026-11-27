import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { GitWorkspaceStatus } from '../../../shared/types';
import { statusLetter } from './gitUtils';

interface GitDiffSplitProps {
  status: GitWorkspaceStatus;
  selectedFile: string | null;
  diffText: string;
  loadingDiff: boolean;
  busy: boolean;
  onSelectFile: (filePath: string) => void;
  onDiscardFile: (filePath: string) => Promise<void>;
}

export const GitDiffSplit: React.FC<GitDiffSplitProps> = ({
  status,
  selectedFile,
  diffText,
  loadingDiff,
  busy,
  onSelectFile,
  onDiscardFile,
}) => {
  if (status.files.length === 0) {
    return (
      <div className="empty-state">
        <Check size={24} style={{ color: 'var(--success)' }} />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Working tree clean on <span className="mono">{status.currentBranch}</span>
        </div>
        <div style={{ fontSize: 12 }}>
          When an AI agent edits files in this repository, every changed file and line-by-line diff
          appears here automatically.
        </div>
      </div>
    );
  }

  return (
    <div className="git-changes-split">
      <div className="git-file-list scroller">
        {status.files.map((f) => (
          <button
            key={f.path}
            type="button"
            className={`git-file-row ${selectedFile === f.path ? 'active' : ''}`}
            onClick={() => onSelectFile(f.path)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span className={`git-status-badge ${f.status}`}>{statusLetter(f.status)}</span>
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={f.path}
              >
                {f.path}
              </span>
            </div>
            <span className="mono" style={{ fontSize: 10.5, flexShrink: 0 }}>
              {f.additions > 0 && <span style={{ color: 'var(--success)' }}>+{f.additions}</span>}
              {f.deletions > 0 && (
                <span style={{ color: 'var(--danger)', marginLeft: 4 }}>-{f.deletions}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="diff-viewer">
        <div className="diff-viewer-head">
          <span
            className="mono"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {selectedFile || 'Select a file'}
          </span>
          {selectedFile && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: '#fca5a5', padding: '2px 8px', fontSize: 11 }}
              disabled={busy}
              onClick={() => void onDiscardFile(selectedFile)}
            >
              <RotateCcw size={11} />
              Discard File
            </button>
          )}
        </div>

        <div className="diff-scroll scroller">
          {loadingDiff ? (
            <div style={{ padding: 16, color: '#94a3b8' }}>Loading diff...</div>
          ) : (
            diffText.split(/\r?\n/).map((line, i) => {
              let cls = 'diff-line';
              if (
                line.startsWith('+++') ||
                line.startsWith('---') ||
                line.startsWith('diff ') ||
                line.startsWith('index ')
              ) {
                cls += ' meta';
              } else if (line.startsWith('@@')) {
                cls += ' hunk';
              } else if (line.startsWith('+')) {
                cls += ' add';
              } else if (line.startsWith('-')) {
                cls += ' del';
              }
              return (
                <div key={i} className={cls}>
                  {line || ' '}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

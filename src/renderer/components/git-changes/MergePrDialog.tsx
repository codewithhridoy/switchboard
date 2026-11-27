import React, { useEffect, useId, useRef, useState } from 'react';
import { GitMerge, Loader2, X } from 'lucide-react';
import {
  GitHubPullRequestInfo,
  GitWorkspaceStatus,
  MergeMethod,
  MergePrInput,
  MergePrResult,
} from '../../../shared/types';
import { attachDialogLightDismissFallback } from '../../utils/dialogHelpers';
import { cleanErrorMessage } from './gitUtils';

const MERGE_STRATEGIES: ReadonlyArray<{ id: MergeMethod; label: string; hint: string }> = [
  { id: 'squash', label: 'Squash & Merge', hint: '1 clean commit' },
  { id: 'merge', label: 'Merge Commit', hint: 'Keep all commits' },
  { id: 'rebase', label: 'Rebase & Merge', hint: 'Linear history' },
];

interface MergePrDialogProps {
  open: boolean;
  pr: GitHubPullRequestInfo | null;
  status: GitWorkspaceStatus;
  initialMethod: MergeMethod;
  onClose: () => void;
  onMergePr: (input: MergePrInput) => Promise<MergePrResult>;
  onMerged: (pr: GitHubPullRequestInfo, res: MergePrResult) => Promise<void>;
}

export const MergePrDialog: React.FC<MergePrDialogProps> = ({
  open,
  pr,
  status,
  initialMethod,
  onClose,
  onMergePr,
  onMerged,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>(initialMethod);
  const [commitTitle, setCommitTitle] = useState('');
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [syncBase, setSyncBase] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && pr && !el.open) {
      setMergeMethod(initialMethod);
      setCommitTitle(`${pr.title} (#${pr.number})`);
      setDeleteBranch(true);
      setSyncBase(status.files.length === 0);
      setError(null);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, pr, initialMethod]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    el.addEventListener('close', onClose);
    return () => {
      cleanup();
      el.removeEventListener('close', onClose);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pr) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onMergePr({
        cwd: status.cwd,
        prNumber: pr.number,
        mergeMethod,
        commitTitle: mergeMethod === 'rebase' ? undefined : commitTitle.trim() || undefined,
        deleteBranch,
        syncBaseBranch: syncBase && status.files.length === 0,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
      });
      dialogRef.current?.close();
      await onMerged(pr, res);
    } catch (err) {
      setError(cleanErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="sb-dialog" aria-labelledby={titleId} {...({ closedby: 'any' } as Record<string, string>)}>
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Merge Pull Request{pr ? ` #${pr.number}` : ''}</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </button>
        </div>
        {pr && (
          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'contents' }}>
            <div className="dialog-body scroller">
              {error && (
                <div style={{ padding: '9px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12.5 }}>
                  {error}
                </div>
              )}
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{pr.title}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {pr.headBranch} → {pr.baseBranch}
                  {typeof pr.commits === 'number' && ` · ${pr.commits} commit${pr.commits === 1 ? '' : 's'}`}
                  {typeof pr.changedFiles === 'number' && ` · ${pr.changedFiles} files`}
                </div>
              </div>
              <div className="field">
                <label>Merge Strategy</label>
                <div role="radiogroup" aria-label="Merge strategy" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {MERGE_STRATEGIES.map((opt) => {
                    const active = mergeMethod === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMergeMethod(opt.id)}
                        style={{
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
                          background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{opt.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {mergeMethod !== 'rebase' && (
                <div className="field">
                  <label htmlFor="merge-commit-title">Commit Title</label>
                  <input id="merge-commit-title" className="input-field" value={commitTitle} onChange={(e) => setCommitTitle(e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} />
                  Delete branch <span className="mono">{pr.headBranch}</span> after merge
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: status.files.length === 0 ? 'pointer' : 'not-allowed', opacity: status.files.length === 0 ? 1 : 0.6 }}>
                  <input type="checkbox" checked={syncBase && status.files.length === 0} disabled={status.files.length > 0} onChange={(e) => setSyncBase(e.target.checked)} />
                  Switch local repo to <span className="mono">{pr.baseBranch}</span> &amp; pull latest
                </label>
              </div>
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <Loader2 size={13} className="spin" /> : <GitMerge size={13} />}
                {mergeMethod === 'squash' ? 'Squash & Merge' : mergeMethod === 'rebase' ? 'Rebase & Merge' : 'Merge Pull Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
};

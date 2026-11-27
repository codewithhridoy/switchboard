import React, { useEffect, useId, useRef, useState } from 'react';
import { GitPullRequest, Loader2, X } from 'lucide-react';
import { CreatePrInput, GitWorkspaceStatus } from '../../../shared/types';
import { attachDialogLightDismissFallback } from '../../utils/dialogHelpers';
import { cleanErrorMessage } from './gitUtils';

interface CreatePrDialogProps {
  open: boolean;
  status: GitWorkspaceStatus;
  defaultCommitMessage?: string;
  currentCommitMsg: string;
  onClose: () => void;
  onCreatePr: (input: CreatePrInput) => Promise<{ url: string; number: number }>;
  onCreated: (res: { url: string; number: number }) => Promise<void>;
}

export const CreatePrDialog: React.FC<CreatePrDialogProps> = ({
  open,
  status,
  defaultCommitMessage,
  currentCommitMsg,
  onClose,
  onCreatePr,
  onCreated,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [draft, setDraft] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      const filesList = status.files.map((f) => `- \`${f.path}\``).join('\n');
      const suggestedTitle =
        status.currentBranch && status.currentBranch !== 'main' && status.currentBranch !== 'master'
          ? status.currentBranch.replace(/[-_/]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
          : defaultCommitMessage || 'Update';
      const defaultBase = status.branches.includes('main')
        ? 'main'
        : status.branches.includes('master')
          ? 'master'
          : 'main';
      setTitle(suggestedTitle);
      setBody(
        filesList
          ? `## Summary\n\nUpdated via Switchboard AI.\n\n## Changed Files\n${filesList}`
          : '## Summary\n\nUpdated via Switchboard AI.'
      );
      setBaseBranch(defaultBase);
      setAutoCommit(status.files.length > 0);
      setCommitMessage(currentCommitMsg.trim() || suggestedTitle);
      setNewBranch(status.currentBranch === defaultBase ? `feat/update-${new Date().toISOString().slice(5, 10)}` : '');
      setError(null);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

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
    setBusy(true);
    setError(null);
    try {
      const res = await onCreatePr({
        cwd: status.cwd,
        title,
        body,
        baseBranch,
        draft,
        autoCommit: autoCommit && status.files.length > 0,
        commitMessage: commitMessage.trim() || title.trim(),
        newBranchName: status.currentBranch === baseBranch ? newBranch.trim() : undefined,
      });
      dialogRef.current?.close();
      await onCreated(res);
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
          <h2 id={titleId}>Create GitHub Pull Request</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            {error && (
              <div style={{ padding: '9px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12.5 }}>
                {error}
              </div>
            )}
            <div className="field-row-2">
              <div className="field">
                <label>Head Branch (Current)</label>
                <input className="input-field mono" value={status.currentBranch} readOnly />
              </div>
              <div className="field">
                <label htmlFor="pr-base">Base Branch</label>
                <select id="pr-base" className="select-compact mono" value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)}>
                  {status.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            {status.currentBranch === baseBranch && (
              <div className="field">
                <label htmlFor="pr-new-branch">New Feature Branch (auto-created before PR)</label>
                <input id="pr-new-branch" className="input-field mono" required placeholder="feat/my-changes" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
              </div>
            )}
            {status.files.length > 0 && (
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoCommit} onChange={(e) => setAutoCommit(e.target.checked)} />
                  Commit &amp; push {status.files.length} uncommitted file{status.files.length === 1 ? '' : 's'} first
                </label>
                {autoCommit && <input type="text" className="input-field" placeholder="Commit message" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} />}
              </div>
            )}
            <div className="field">
              <label htmlFor="pr-title">Pull Request Title</label>
              <input id="pr-title" className="input-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pr-body">Description</label>
              <textarea id="pr-body" className="composer-textarea scroller" style={{ minHeight: 110 }} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
              Create as Draft PR
            </label>
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Loader2 size={13} className="spin" /> : <GitPullRequest size={13} />}
              {autoCommit && status.files.length > 0 ? 'Commit, Push & Create PR' : 'Push & Create PR'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};

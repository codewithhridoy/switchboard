import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import {
  CreatePrInput,
  GitHubPullRequestInfo,
  GitWorkspaceStatus,
  MergeMethod,
  MergePrInput,
  MergePrResult,
} from '../../shared/types';
import { attachDialogLightDismissFallback } from '../utils/dialogHelpers';

interface GitChangesPanelProps {
  status: GitWorkspaceStatus | null;
  loading: boolean;
  defaultCommitMessage?: string;
  onRefresh: () => Promise<void>;
  onGetFileDiff: (cwd: string, filePath: string) => Promise<string>;
  onCheckout: (cwd: string, branch: string, createNew?: boolean) => Promise<void>;
  onDiscardFile: (cwd: string, filePath: string) => Promise<void>;
  onCommitAll: (cwd: string, message: string) => Promise<{ commitHash: string }>;
  onPush: (cwd: string) => Promise<{ branch: string }>;
  onCreatePr: (input: CreatePrInput) => Promise<{ url: string; number: number }>;
  onGetCurrentPr: (cwd: string) => Promise<GitHubPullRequestInfo | null>;
  onMergePr: (input: MergePrInput) => Promise<MergePrResult>;
  onOpenExternal: (url: string) => Promise<void>;
}

function statusLetter(s: string): string {
  if (s === 'untracked') return '?';
  if (s === 'added') return 'A';
  if (s === 'deleted') return 'D';
  if (s === 'renamed') return 'R';
  return 'M';
}

function cleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim();
}

export const GitChangesPanel: React.FC<GitChangesPanelProps> = ({
  status,
  loading,
  defaultCommitMessage,
  onRefresh,
  onGetFileDiff,
  onCheckout,
  onDiscardFile,
  onCommitAll,
  onPush,
  onCreatePr,
  onGetCurrentPr,
  onMergePr,
  onOpenExternal,
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const [commitMsg, setCommitMsg] = useState(defaultCommitMessage || '');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    ok: boolean;
    text: string;
    url?: string;
    urlLabel?: string;
  } | null>(null);

  // Create PR Modal state
  const prDialogRef = useRef<HTMLDialogElement | null>(null);
  const prTitleId = useId();
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prDraft, setPrDraft] = useState(false);
  const [prAutoCommit, setPrAutoCommit] = useState(true);
  const [prCommitMessage, setPrCommitMessage] = useState('');
  const [prNewBranch, setPrNewBranch] = useState('');
  const [prError, setPrError] = useState<string | null>(null);

  // Active Open PR & Merge PR Modal state
  const [openPr, setOpenPr] = useState<GitHubPullRequestInfo | null>(null);
  const [loadingPr, setLoadingPr] = useState(false);
  const mergeDialogRef = useRef<HTMLDialogElement | null>(null);
  const mergeTitleId = useId();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash');
  const [mergeCommitTitle, setMergeCommitTitle] = useState('');
  const [mergeDeleteBranch, setMergeDeleteBranch] = useState(true);
  const [mergeSyncBase, setMergeSyncBase] = useState(true);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const refreshOpenPr = async (cwd: string, hasRemote: boolean) => {
    if (!hasRemote) {
      setOpenPr(null);
      return;
    }
    setLoadingPr(true);
    try {
      const pr = await onGetCurrentPr(cwd);
      setOpenPr(pr);
    } catch {
      setOpenPr(null);
    } finally {
      setLoadingPr(false);
    }
  };

  useEffect(() => {
    if (!status?.isGitRepo) {
      setOpenPr(null);
      return;
    }
    void refreshOpenPr(status.cwd, Boolean(status.githubFullName));
  }, [status?.cwd, status?.currentBranch, status?.githubFullName]);

  useEffect(() => {
    const el = mergeDialogRef.current;
    if (!el) return;
    if (mergeOpen && openPr && !el.open) {
      setMergeCommitTitle(`${openPr.title} (#${openPr.number})`);
      setMergeDeleteBranch(true);
      setMergeSyncBase((status?.files.length ?? 0) === 0);
      setMergeError(null);
      el.showModal();
    } else if (!mergeOpen && el.open) {
      el.close();
    }
  }, [mergeOpen, openPr]);

  useEffect(() => {
    const el = mergeDialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    const onClose = () => setMergeOpen(false);
    el.addEventListener('close', onClose);
    return () => {
      cleanup();
      el.removeEventListener('close', onClose);
    };
  }, []);

  useEffect(() => {
    if (!commitMsg && defaultCommitMessage) {
      setCommitMsg(defaultCommitMessage);
    }
  }, [defaultCommitMessage, commitMsg]);

  useEffect(() => {
    const files = status?.files ?? [];
    if (files.length === 0) {
      setSelectedFile(null);
      setDiffText('');
      return;
    }
    if (!selectedFile || !files.some((f) => f.path === selectedFile)) {
      setSelectedFile(files[0].path);
    }
  }, [status, selectedFile]);

  useEffect(() => {
    if (!status?.isGitRepo || !selectedFile) return;
    let active = true;
    setLoadingDiff(true);
    void onGetFileDiff(status.cwd, selectedFile)
      .then((text) => {
        if (active) setDiffText(text);
      })
      .finally(() => {
        if (active) setLoadingDiff(false);
      });
    return () => {
      active = false;
    };
  }, [status?.cwd, status?.isGitRepo, selectedFile, status?.files.length, onGetFileDiff]);

  useEffect(() => {
    const el = prDialogRef.current;
    if (!el) return;
    if (prOpen && !el.open) {
      const filesList = (status?.files ?? []).map((f) => `- \`${f.path}\``).join('\n');
      const suggestedTitle =
        status?.currentBranch && status.currentBranch !== 'main' && status.currentBranch !== 'master'
          ? status.currentBranch.replace(/[-_/]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
          : defaultCommitMessage || 'Update';
      setPrTitle(suggestedTitle);
      setPrBody(
        filesList
          ? `## Summary\n\nUpdated via Switchboard AI.\n\n## Changed Files\n${filesList}`
          : '## Summary\n\nUpdated via Switchboard AI.'
      );
      const defaultBase = status?.branches.includes('main')
        ? 'main'
        : status?.branches.includes('master')
          ? 'master'
          : 'main';
      setPrBase(defaultBase);
      setPrAutoCommit((status?.files.length ?? 0) > 0);
      setPrCommitMessage(commitMsg.trim() || suggestedTitle);
      setPrNewBranch(
        status?.currentBranch === defaultBase
          ? `feat/update-${new Date().toISOString().slice(5, 10)}`
          : ''
      );
      setPrError(null);
      el.showModal();
    } else if (!prOpen && el.open) {
      el.close();
    }
  }, [prOpen]);

  useEffect(() => {
    const el = prDialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    const onClose = () => setPrOpen(false);
    el.addEventListener('close', onClose);
    return () => {
      cleanup();
      el.removeEventListener('close', onClose);
    };
  }, []);

  if (!status || !status.isGitRepo) {
    return (
      <div className="empty-state">
        <GitBranch size={26} style={{ opacity: 0.45 }} />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Not a Git repository
        </div>
        <div style={{ fontSize: 12.5, maxWidth: 360 }}>
          Select a Git project folder in Coding mode to inspect changed files, view diffs, switch branches, commit, push, and create Pull Requests.
        </div>
      </div>
    );
  }

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    setNotice(null);
    try {
      await fn();
      await onRefresh();
    } catch (err) {
      setNotice({ ok: false, text: cleanErrorMessage(err) });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Git Branch, Commit, Push & PR Toolbar */}
      <div className="git-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <GitBranch size={14} style={{ color: 'var(--accent)' }} />
          <select
            className="select-compact mono"
            aria-label="Current Git branch"
            value={status.currentBranch}
            disabled={busyAction !== null}
            onChange={(e) =>
              void runAction('checkout', async () => {
                await onCheckout(status.cwd, e.target.value, false);
                setNotice({ ok: true, text: `Switched to branch ${e.target.value}` });
              })
            }
          >
            {status.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {!newBranchOpen ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setNewBranchOpen(true)}
            >
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
                    void runAction('new-branch', async () => {
                      await onCheckout(status.cwd, newBranchName.trim(), true);
                      setNotice({ ok: true, text: `Created & switched to ${newBranchName.trim()}` });
                      setNewBranchName('');
                      setNewBranchOpen(false);
                    });
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!newBranchName.trim() || busyAction !== null}
                onClick={() =>
                  void runAction('new-branch', async () => {
                    await onCheckout(status.cwd, newBranchName.trim(), true);
                    setNotice({ ok: true, text: `Created & switched to ${newBranchName.trim()}` });
                    setNewBranchName('');
                    setNewBranchOpen(false);
                  })
                }
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
          {status.ahead > 0 && (
            <span className="pill pill-accent mono">{status.ahead} ahead</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction('push', async () => {
                const res = await onPush(status.cwd);
                setNotice({ ok: true, text: `Pushed ${res.branch} to origin.` });
              })
            }
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
              onClick={() => setMergeOpen(true)}
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
              onClick={() => setPrOpen(true)}
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
            onClick={() => {
              void onRefresh();
              void refreshOpenPr(status.cwd, Boolean(status.githubFullName));
            }}
          >
            <RefreshCw size={13} className={loading || loadingPr ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Active Pull Request Bar (Merge directly from Switchboard) */}
      {openPr && (
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
              PR #{openPr.number}
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
              title={openPr.title}
            >
              {openPr.title}
            </span>
            <span className="pill mono" style={{ flexShrink: 0 }}>
              {openPr.headBranch} → {openPr.baseBranch}
            </span>
            {openPr.draft && <span className="pill pill-warning">Draft</span>}
            {openPr.mergeable === false && (
              <span className="pill pill-danger">Merge Conflicts</span>
            )}
            {typeof openPr.changedFiles === 'number' && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {openPr.changedFiles} files
                {typeof openPr.additions === 'number' && (
                  <span style={{ color: 'var(--success)', marginLeft: 5 }}>+{openPr.additions}</span>
                )}
                {typeof openPr.deletions === 'number' && (
                  <span style={{ color: 'var(--danger)', marginLeft: 4 }}>-{openPr.deletions}</span>
                )}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void onOpenExternal(openPr.url)}
            >
              View on GitHub <ExternalLink size={11} />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busyAction !== null || openPr.draft || openPr.mergeable === false}
              title={
                openPr.draft
                  ? 'Mark PR ready for review on GitHub before merging'
                  : openPr.mergeable === false
                    ? 'Resolve merge conflicts before merging'
                    : `Merge PR #${openPr.number} into ${openPr.baseBranch}`
              }
              onClick={() => setMergeOpen(true)}
            >
              <GitMerge size={12} />
              Merge PR
            </button>
          </div>
        </div>
      )}

      {/* Commit bar when there are changed files */}
      {status.files.length > 0 && (
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            className="input-field"
            style={{ flex: 1, height: 30 }}
            placeholder="Commit message (e.g. feat: implement checkout flow)"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={!commitMsg.trim() || busyAction !== null}
            onClick={() =>
              void runAction('commit', async () => {
                const res = await onCommitAll(status.cwd, commitMsg);
                setNotice({ ok: true, text: `Committed ${res.commitHash} on ${status.currentBranch}` });
                setCommitMsg('');
              })
            }
          >
            {busyAction === 'commit' ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <GitCommitHorizontal size={13} />
            )}
            Stage & Commit ({status.files.length})
          </button>
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: '7px 14px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: notice.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
            color: notice.ok ? 'var(--success)' : 'var(--danger)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <span>{notice.text}</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {notice.url && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void onOpenExternal(notice.url!)}
              >
                {notice.urlLabel || 'View on GitHub'} <ExternalLink size={11} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ width: 22, height: 22, padding: 2 }}
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Changed files + Unified Diff Split */}
      {status.files.length === 0 ? (
        <div className="empty-state">
          <Check size={24} style={{ color: 'var(--success)' }} />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Working tree clean on <span className="mono">{status.currentBranch}</span>
          </div>
          <div style={{ fontSize: 12 }}>
            When an AI agent edits files in this repository, every changed file and line-by-line diff appears here automatically.
          </div>
        </div>
      ) : (
        <div className="git-changes-split">
          <div className="git-file-list scroller">
            {status.files.map((f) => (
              <button
                key={f.path}
                type="button"
                className={`git-file-row ${selectedFile === f.path ? 'active' : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span className={`git-status-badge ${f.status}`}>
                    {statusLetter(f.status)}
                  </span>
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
              <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile || 'Select a file'}
              </span>
              {selectedFile && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#fca5a5', padding: '2px 8px', fontSize: 11 }}
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction('discard', async () => {
                      await onDiscardFile(status.cwd, selectedFile);
                      setNotice({ ok: true, text: `Discarded changes in ${selectedFile}` });
                    })
                  }
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
                  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
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
      )}

      {/* Native <dialog> Create Pull Request Modal */}
      <dialog
        ref={prDialogRef}
        className="sb-dialog"
        aria-labelledby={prTitleId}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        <div className="dialog-inner">
          <div className="dialog-header">
            <h2 id={prTitleId}>Create GitHub Pull Request</h2>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Close dialog"
              onClick={() => prDialogRef.current?.close()}
            >
              <X size={16} />
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusyAction('pr');
              setPrError(null);
              try {
                const res = await onCreatePr({
                  cwd: status.cwd,
                  title: prTitle,
                  body: prBody,
                  baseBranch: prBase,
                  draft: prDraft,
                  autoCommit: prAutoCommit && status.files.length > 0,
                  commitMessage: prCommitMessage.trim() || prTitle.trim(),
                  newBranchName: status.currentBranch === prBase ? prNewBranch.trim() : undefined,
                });
                setNotice({
                  ok: true,
                  text: `Opened Pull Request #${res.number}!`,
                  url: res.url,
                  urlLabel: 'View on GitHub',
                });
                prDialogRef.current?.close();
                await onRefresh();
                await refreshOpenPr(status.cwd, true);
              } catch (err) {
                setPrError(cleanErrorMessage(err));
              } finally {
                setBusyAction(null);
              }
            }}
            style={{ display: 'contents' }}
          >
            <div className="dialog-body scroller">
              {prError && (
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    fontSize: 12.5,
                  }}
                >
                  {prError}
                </div>
              )}

              <div className="field-row-2">
                <div className="field">
                  <label>Head Branch (Current)</label>
                  <input className="input-field mono" value={status.currentBranch} readOnly />
                </div>
                <div className="field">
                  <label htmlFor="pr-base">Base Branch</label>
                  <select
                    id="pr-base"
                    className="select-compact mono"
                    value={prBase}
                    onChange={(e) => setPrBase(e.target.value)}
                  >
                    {status.branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {status.currentBranch === prBase && (
                <div className="field">
                  <label htmlFor="pr-new-branch">New Feature Branch (auto-created before PR)</label>
                  <input
                    id="pr-new-branch"
                    className="input-field mono"
                    required
                    placeholder="feat/my-changes"
                    value={prNewBranch}
                    onChange={(e) => setPrNewBranch(e.target.value)}
                  />
                </div>
              )}

              {status.files.length > 0 && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={prAutoCommit}
                      onChange={(e) => setPrAutoCommit(e.target.checked)}
                    />
                    Commit &amp; push {status.files.length} uncommitted file{status.files.length === 1 ? '' : 's'} first
                  </label>
                  {prAutoCommit && (
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Commit message"
                      value={prCommitMessage}
                      onChange={(e) => setPrCommitMessage(e.target.value)}
                    />
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="pr-title">Pull Request Title</label>
                <input
                  id="pr-title"
                  className="input-field"
                  required
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="pr-body">Description</label>
                <textarea
                  id="pr-body"
                  className="composer-textarea scroller"
                  style={{ minHeight: 110 }}
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                />
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prDraft}
                  onChange={(e) => setPrDraft(e.target.checked)}
                />
                Create as Draft PR
              </label>
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn" onClick={() => prDialogRef.current?.close()}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busyAction === 'pr'}>
                {busyAction === 'pr' ? <Loader2 size={13} className="spin" /> : <GitPullRequest size={13} />}
                {prAutoCommit && status.files.length > 0
                  ? 'Commit, Push & Create PR'
                  : 'Push & Create PR'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      {/* Native <dialog> Merge Pull Request Modal */}
      <dialog
        ref={mergeDialogRef}
        className="sb-dialog"
        aria-labelledby={mergeTitleId}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        <div className="dialog-inner">
          <div className="dialog-header">
            <h2 id={mergeTitleId}>
              Merge Pull Request{openPr ? ` #${openPr.number}` : ''}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Close dialog"
              onClick={() => mergeDialogRef.current?.close()}
            >
              <X size={16} />
            </button>
          </div>
          {openPr && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusyAction('merge');
                setMergeError(null);
                try {
                  const res = await onMergePr({
                    cwd: status.cwd,
                    prNumber: openPr.number,
                    mergeMethod,
                    commitTitle:
                      mergeMethod === 'rebase' ? undefined : mergeCommitTitle.trim() || undefined,
                    deleteBranch: mergeDeleteBranch,
                    syncBaseBranch: mergeSyncBase,
                    headBranch: openPr.headBranch,
                    baseBranch: openPr.baseBranch,
                  });
                  const extras: string[] = [];
                  if (res.deletedBranch) extras.push(`deleted ${openPr.headBranch}`);
                  if (res.switchedToBase) extras.push(`switched to ${res.switchedToBase} & pulled`);
                  setNotice({
                    ok: true,
                    text: `Merged PR #${openPr.number} into ${openPr.baseBranch}${extras.length ? ` (${extras.join(', ')})` : ''}!`,
                    url: openPr.url,
                    urlLabel: 'View on GitHub',
                  });
                  setOpenPr(null);
                  mergeDialogRef.current?.close();
                  await onRefresh();
                } catch (err) {
                  setMergeError(cleanErrorMessage(err));
                } finally {
                  setBusyAction(null);
                }
              }}
              style={{ display: 'contents' }}
            >
              <div className="dialog-body scroller">
                {mergeError && (
                  <div
                    style={{
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--danger-soft)',
                      color: 'var(--danger)',
                      fontSize: 12.5,
                    }}
                  >
                    {mergeError}
                  </div>
                )}

                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{openPr.title}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {openPr.headBranch} → {openPr.baseBranch}
                    {typeof openPr.commits === 'number' && ` · ${openPr.commits} commit${openPr.commits === 1 ? '' : 's'}`}
                    {typeof openPr.changedFiles === 'number' && ` · ${openPr.changedFiles} files`}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="merge-method">Merge Strategy</label>
                  <select
                    id="merge-method"
                    className="select-compact"
                    value={mergeMethod}
                    onChange={(e) => setMergeMethod(e.target.value as MergeMethod)}
                  >
                    <option value="squash">Squash and merge (Recommended — 1 clean commit)</option>
                    <option value="merge">Create a merge commit</option>
                    <option value="rebase">Rebase and merge</option>
                  </select>
                </div>

                {mergeMethod !== 'rebase' && (
                  <div className="field">
                    <label htmlFor="merge-commit-title">Commit Title</label>
                    <input
                      id="merge-commit-title"
                      className="input-field"
                      value={mergeCommitTitle}
                      onChange={(e) => setMergeCommitTitle(e.target.value)}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mergeDeleteBranch}
                      onChange={(e) => setMergeDeleteBranch(e.target.checked)}
                    />
                    Delete branch <span className="mono">{openPr.headBranch}</span> after merge
                  </label>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 12.5,
                      cursor: status.files.length === 0 ? 'pointer' : 'not-allowed',
                      opacity: status.files.length === 0 ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mergeSyncBase && status.files.length === 0}
                      disabled={status.files.length > 0}
                      onChange={(e) => setMergeSyncBase(e.target.checked)}
                    />
                    Switch local repo to <span className="mono">{openPr.baseBranch}</span> &amp; pull latest
                  </label>
                </div>
              </div>
              <div className="dialog-footer">
                <button type="button" className="btn" onClick={() => mergeDialogRef.current?.close()}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busyAction === 'merge'}>
                  {busyAction === 'merge' ? <Loader2 size={13} className="spin" /> : <GitMerge size={13} />}
                  Confirm Merge
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
};

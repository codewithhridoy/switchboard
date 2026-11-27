import React, { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, GitCommitHorizontal, Loader2, X } from 'lucide-react';
import {
  CreatePrInput,
  GitHubPullRequestInfo,
  GitWorkspaceStatus,
  MergeMethod,
  MergePrInput,
  MergePrResult,
} from '../../shared/types';
import { ActivePrBanner } from './git-changes/ActivePrBanner';
import { CreatePrDialog } from './git-changes/CreatePrDialog';
import { GitDiffSplit } from './git-changes/GitDiffSplit';
import { GitToolbar } from './git-changes/GitToolbar';
import { MergePrDialog } from './git-changes/MergePrDialog';
import { cleanErrorMessage } from './git-changes/gitUtils';

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

export const GitChangesPanel: React.FC<GitChangesPanelProps> = (props) => {
  const { status, loading, defaultCommitMessage } = props;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [commitMsg, setCommitMsg] = useState(defaultCommitMessage || '');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; url?: string; urlLabel?: string } | null>(null);
  const [openPr, setOpenPr] = useState<GitHubPullRequestInfo | null>(null);
  const [loadingPr, setLoadingPr] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash');

  const refreshOpenPr = async (cwd: string, hasRemote: boolean) => {
    if (!hasRemote) { setOpenPr(null); return; }
    setLoadingPr(true);
    try { setOpenPr(await props.onGetCurrentPr(cwd)); } catch { setOpenPr(null); } finally { setLoadingPr(false); }
  };

  useEffect(() => {
    if (!commitMsg && defaultCommitMessage) setCommitMsg(defaultCommitMessage);
  }, [defaultCommitMessage, commitMsg]);

  useEffect(() => {
    const files = status?.files ?? [];
    if (files.length === 0) { setSelectedFile(null); setDiffText(''); return; }
    if (!selectedFile || !files.some((f) => f.path === selectedFile)) setSelectedFile(files[0].path);
  }, [status, selectedFile]);

  useEffect(() => {
    if (!status?.isGitRepo || !selectedFile) return;
    let active = true;
    setLoadingDiff(true);
    void props.onGetFileDiff(status.cwd, selectedFile).then((text) => { if (active) setDiffText(text); }).finally(() => { if (active) setLoadingDiff(false); });
    return () => { active = false; };
  }, [status?.cwd, status?.isGitRepo, selectedFile, status?.files.length, props.onGetFileDiff]);

  useEffect(() => {
    if (!status?.isGitRepo) { setOpenPr(null); return; }
    void refreshOpenPr(status.cwd, Boolean(status.githubFullName));
  }, [status?.cwd, status?.currentBranch, status?.githubFullName]);

  if (!status || !status.isGitRepo) {
    return (
      <div className="empty-state">
        <GitBranch size={26} style={{ opacity: 0.45 }} />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Not a Git repository</div>
        <div style={{ fontSize: 12.5, maxWidth: 360 }}>
          Select a Git project folder in Coding mode to inspect changed files, view diffs, switch branches, commit, push, and create or merge Pull Requests.
        </div>
      </div>
    );
  }

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    setNotice(null);
    try { await fn(); await props.onRefresh(); } catch (err) { setNotice({ ok: false, text: cleanErrorMessage(err) }); } finally { setBusyAction(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <GitToolbar
        status={status}
        openPr={openPr}
        loading={loading || loadingPr}
        busyAction={busyAction}
        onSwitchBranch={(b) => runAction('checkout', async () => { await props.onCheckout(status.cwd, b, false); setNotice({ ok: true, text: `Switched to branch ${b}` }); })}
        onCreateBranch={(b) => runAction('new-branch', async () => { await props.onCheckout(status.cwd, b, true); setNotice({ ok: true, text: `Created & switched to ${b}` }); })}
        onPush={() => runAction('push', async () => { const res = await props.onPush(status.cwd); setNotice({ ok: true, text: `Pushed ${res.branch} to origin.` }); })}
        onOpenCreatePr={() => setPrOpen(true)}
        onOpenMergePr={() => setMergeOpen(true)}
        onRefresh={() => { void props.onRefresh(); void refreshOpenPr(status.cwd, Boolean(status.githubFullName)); }}
      />

      {openPr && (
        <ActivePrBanner
          pr={openPr}
          disabled={busyAction !== null}
          onOpenExternal={props.onOpenExternal}
          onRequestMerge={(method) => { setMergeMethod(method); setMergeOpen(true); }}
        />
      )}

      {status.files.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input type="text" className="input-field" style={{ flex: 1, height: 30 }} placeholder="Commit message (e.g. feat: implement checkout flow)" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} />
          <button
            type="button"
            className="btn btn-sm"
            disabled={!commitMsg.trim() || busyAction !== null}
            onClick={() => void runAction('commit', async () => { const res = await props.onCommitAll(status.cwd, commitMsg); setNotice({ ok: true, text: `Committed ${res.commitHash} on ${status.currentBranch}` }); setCommitMsg(''); })}
          >
            {busyAction === 'commit' ? <Loader2 size={12} className="spin" /> : <GitCommitHorizontal size={13} />}
            Stage &amp; Commit ({status.files.length})
          </button>
        </div>
      )}

      {notice && (
        <div style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: notice.ok ? 'var(--success-soft)' : 'var(--danger-soft)', color: notice.ok ? 'var(--success)' : 'var(--danger)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span>{notice.text}</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {notice.url && (
              <button type="button" className="btn btn-sm" onClick={() => void props.onOpenExternal(notice.url!)}>
                {notice.urlLabel || 'View on GitHub'} <ExternalLink size={11} />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 22, height: 22, padding: 2 }} aria-label="Dismiss notification" onClick={() => setNotice(null)}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <GitDiffSplit
        status={status}
        selectedFile={selectedFile}
        diffText={diffText}
        loadingDiff={loadingDiff}
        busy={busyAction !== null}
        onSelectFile={setSelectedFile}
        onDiscardFile={(file) => runAction('discard', async () => { await props.onDiscardFile(status.cwd, file); setNotice({ ok: true, text: `Discarded changes in ${file}` }); })}
      />

      <CreatePrDialog
        open={prOpen}
        status={status}
        defaultCommitMessage={defaultCommitMessage}
        currentCommitMsg={commitMsg}
        onClose={() => setPrOpen(false)}
        onCreatePr={props.onCreatePr}
        onCreated={async (res) => {
          setNotice({ ok: true, text: `Opened Pull Request #${res.number}!`, url: res.url, urlLabel: 'View on GitHub' });
          await props.onRefresh();
          await refreshOpenPr(status.cwd, true);
        }}
      />

      <MergePrDialog
        open={mergeOpen}
        pr={openPr}
        status={status}
        initialMethod={mergeMethod}
        onClose={() => setMergeOpen(false)}
        onMergePr={props.onMergePr}
        onMerged={async (pr, res) => {
          const extras: string[] = [];
          if (res.deletedBranch) extras.push(`deleted ${pr.headBranch}`);
          if (res.switchedToBase) extras.push(`switched to ${res.switchedToBase} & pulled`);
          setNotice({ ok: true, text: `Merged PR #${pr.number} into ${pr.baseBranch}${extras.length ? ` (${extras.join(', ')})` : ''}!`, url: pr.url, urlLabel: 'View on GitHub' });
          setOpenPr(null);
          await props.onRefresh();
        }}
      />
    </div>
  );
};

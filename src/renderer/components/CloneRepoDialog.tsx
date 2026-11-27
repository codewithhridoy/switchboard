import React, { useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, GitBranch, Loader2, X } from 'lucide-react';
import { AccountScope, CloneRepoInput, GitHubRepoSummary } from '../../shared/types';
import { attachDialogLightDismissFallback, syncFieldAriaValidation } from '../utils/dialogHelpers';
import { GitHubRepoPicker } from './dialogs/GitHubRepoPicker';

interface CloneRepoDialogProps {
  open: boolean;
  defaultParentDir: string;
  githubConnected: boolean;
  githubUsername?: string;
  onClose: () => void;
  onPickFolder: () => Promise<string | null>;
  onListGitHubRepos: () => Promise<GitHubRepoSummary[]>;
  onClone: (input: CloneRepoInput) => Promise<void>;
}

export const CloneRepoDialog: React.FC<CloneRepoDialogProps> = ({
  open,
  defaultParentDir,
  githubConnected,
  githubUsername,
  onClose,
  onPickFolder,
  onListGitHubRepos,
  onClone,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [repoUrl, setRepoUrl] = useState('');
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [folderName, setFolderName] = useState('');
  const [branch, setBranch] = useState('');
  const [scope, setScope] = useState<AccountScope>('personal');
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parentDir && defaultParentDir) setParentDir(defaultParentDir);
  }, [defaultParentDir, parentDir]);

  const fetchRepos = async () => {
    setLoadingRepos(true);
    setError(null);
    try { setRepos(await onListGitHubRepos()); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setLoadingRepos(false); }
  };

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setError(null);
      el.showModal();
      if (githubConnected && repos.length === 0) void fetchRepos();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, githubConnected]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    el.addEventListener('close', onClose);
    return () => { cleanup(); el.removeEventListener('close', onClose); };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(syncFieldAriaValidation);
      return;
    }
    setCloning(true);
    setError(null);
    try {
      await onClone({ repoUrl: repoUrl.trim(), parentDir: parentDir.trim(), folderName: folderName.trim() || undefined, branch: branch.trim() || undefined, scope });
      setRepoUrl(''); setFolderName(''); setBranch('');
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloning(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="sb-dialog" aria-labelledby={titleId} {...({ closedby: 'any' } as Record<string, string>)}>
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Clone Git Repository</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            {githubConnected && (
              <GitHubRepoPicker
                githubUsername={githubUsername}
                repos={repos}
                loading={loadingRepos}
                selectedCloneUrl={repoUrl}
                onRefresh={fetchRepos}
                onSelectRepo={(r) => { setRepoUrl(r.cloneUrl); setFolderName(r.name); setBranch(''); }}
              />
            )}
            <div className="field">
              <label htmlFor="clone-url">Repository URL or `owner/repo`</label>
              <span id="clone-url-hint" className="field-hint">
                Supports HTTPS, SSH, or GitHub shorthand (e.g. codewithhridoy/switchboard). Private repos authenticate via GitHub Sync.
              </span>
              <input id="clone-url" className="input-field mono" type="text" required minLength={3} placeholder="https://github.com/owner/repo.git or owner/repo" value={repoUrl} aria-invalid="false" aria-describedby="clone-url-hint" data-error="clone-url-error" onChange={(e) => { setRepoUrl(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
              <div id="clone-url-error" className="field-error">Please enter a repository URL or owner/repo shorthand.</div>
            </div>
            <div className="field">
              <label htmlFor="clone-parent">Destination Parent Folder</label>
              <span id="clone-parent-hint" className="field-hint">The cloned repository will be placed inside this directory.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="clone-parent" className="input-field mono" style={{ flex: 1 }} type="text" required value={parentDir} aria-invalid="false" aria-describedby="clone-parent-hint" data-error="clone-parent-error" onChange={(e) => { setParentDir(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
                <button type="button" className="btn btn-sm" onClick={async () => { const picked = await onPickFolder(); if (picked) setParentDir(picked); }}>
                  <FolderOpen size={14} /> Browse
                </button>
              </div>
              <div id="clone-parent-error" className="field-error">Please choose a destination directory.</div>
            </div>
            <div className="field-row-2">
              <div className="field">
                <label htmlFor="clone-folder">Folder Name (Optional)</label>
                <span className="field-hint">Defaults to the repository name.</span>
                <input id="clone-folder" className="input-field mono" type="text" placeholder="Auto from repo name" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="clone-scope">Workspace Scope</label>
                <span className="field-hint">Controls Personal vs Team routing.</span>
                <select id="clone-scope" className="select-compact" value={scope} onChange={(e) => setScope(e.target.value as AccountScope)}>
                  <option value="personal">Personal</option>
                  <option value="team">Team / Work</option>
                  <option value="any">Any Account</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="clone-branch"><GitBranch size={12} /> Specific Branch (Optional)</label>
              <span className="field-hint">Leave blank to clone the default branch.</span>
              <input id="clone-branch" className="input-field mono" type="text" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={cloning}>
              {cloning && <Loader2 size={13} className="spin" />}
              {cloning ? 'Cloning...' : 'Clone & Open Project'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};

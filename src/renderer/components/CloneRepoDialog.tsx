import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  GitBranch,
  Github,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { AccountScope, CloneRepoInput, GitHubRepoSummary } from '../../shared/types';
import {
  attachDialogLightDismissFallback,
  syncFieldAriaValidation,
} from '../utils/dialogHelpers';

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
  const [repoFilter, setRepoFilter] = useState('');
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parentDir && defaultParentDir) setParentDir(defaultParentDir);
  }, [defaultParentDir, parentDir]);

  const fetchRepos = async () => {
    setLoadingRepos(true);
    setError(null);
    try {
      const list = await onListGitHubRepos();
      setRepos(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setError(null);
      el.showModal();
      if (githubConnected && repos.length === 0) {
        void fetchRepos();
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, githubConnected]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = attachDialogLightDismissFallback(el);
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => {
      cleanup();
      el.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const filteredRepos = useMemo(() => {
    const q = repoFilter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
    );
  }, [repos, repoFilter]);

  const handleSelectRepo = (r: GitHubRepoSummary) => {
    setRepoUrl(r.cloneUrl);
    setFolderName(r.name);
    setBranch('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((el) => {
        syncFieldAriaValidation(el);
      });
      return;
    }

    setCloning(true);
    setError(null);
    try {
      await onClone({
        repoUrl: repoUrl.trim(),
        parentDir: parentDir.trim(),
        folderName: folderName.trim() || undefined,
        branch: branch.trim() || undefined,
        scope,
      });
      setRepoUrl('');
      setFolderName('');
      setBranch('');
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloning(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="sb-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Clone Git Repository</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close dialog"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            {/* GitHub Repo Picker (when connected) */}
            {githubConnected && (
              <div className="field">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <label htmlFor="clone-search">
                    <Github size={13} />
                    Pick from GitHub {githubUsername ? `(@${githubUsername})` : ''}
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loadingRepos}
                    onClick={() => void fetchRepos()}
                  >
                    <RefreshCw size={12} className={loadingRepos ? 'spin' : ''} />
                    Refresh
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="clone-search"
                    type="search"
                    className="input-field"
                    style={{ width: '100%', paddingLeft: 30 }}
                    placeholder="Filter your repositories..."
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                  />
                </div>

                <div
                  className="scroller"
                  style={{
                    maxHeight: 168,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    marginTop: 4,
                    padding: 4,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {loadingRepos ? (
                    <div
                      style={{
                        padding: 16,
                        textAlign: 'center',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Loading repositories...
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div
                      style={{
                        padding: 14,
                        textAlign: 'center',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      No matching repositories found. You can still paste any Git URL below.
                    </div>
                  ) : (
                    filteredRepos.map((r) => {
                      const selected = repoUrl === r.cloneUrl;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`preset-tile ${selected ? 'active' : ''}`}
                          style={{ padding: '7px 10px' }}
                          onClick={() => handleSelectRepo(r)}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <strong className="mono" style={{ fontSize: 12 }}>
                              {r.fullName}
                            </strong>
                            <span className="pill" style={{ fontSize: 10.5 }}>
                              {r.private ? <Lock size={10} /> : <Globe size={10} />}
                              {r.private ? 'Private' : 'Public'}
                            </span>
                          </div>
                          {r.description && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {r.description}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="clone-url">Repository URL or `owner/repo`</label>
              <span id="clone-url-hint" className="field-hint">
                Supports HTTPS, SSH, or GitHub shorthand (e.g. codewithhridoy/switchboard). Private GitHub repos authenticate automatically via GitHub Sync.
              </span>
              <input
                id="clone-url"
                className="input-field mono"
                type="text"
                required
                minLength={3}
                placeholder="https://github.com/owner/repo.git or owner/repo"
                value={repoUrl}
                aria-invalid="false"
                aria-describedby="clone-url-hint"
                data-error="clone-url-error"
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  syncFieldAriaValidation(e.target);
                }}
                onBlur={(e) => syncFieldAriaValidation(e.target)}
              />
              <div id="clone-url-error" className="field-error">
                Please enter a repository URL or owner/repo shorthand.
              </div>
            </div>

            <div className="field">
              <label htmlFor="clone-parent">Destination Parent Folder</label>
              <span id="clone-parent-hint" className="field-hint">
                The cloned repository will be placed inside this directory.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="clone-parent"
                  className="input-field mono"
                  style={{ flex: 1 }}
                  type="text"
                  required
                  value={parentDir}
                  aria-invalid="false"
                  aria-describedby="clone-parent-hint"
                  data-error="clone-parent-error"
                  onChange={(e) => {
                    setParentDir(e.target.value);
                    syncFieldAriaValidation(e.target);
                  }}
                  onBlur={(e) => syncFieldAriaValidation(e.target)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    const picked = await onPickFolder();
                    if (picked) setParentDir(picked);
                  }}
                >
                  <FolderOpen size={14} />
                  Browse
                </button>
              </div>
              <div id="clone-parent-error" className="field-error">
                Please choose a destination directory.
              </div>
            </div>

            <div className="field-row-2">
              <div className="field">
                <label htmlFor="clone-folder">Folder Name (Optional)</label>
                <span className="field-hint">Defaults to the repository name.</span>
                <input
                  id="clone-folder"
                  className="input-field mono"
                  type="text"
                  placeholder="Auto from repo name"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="clone-scope">Workspace Scope</label>
                <span className="field-hint">Controls Personal vs Team routing.</span>
                <select
                  id="clone-scope"
                  className="select-compact"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as AccountScope)}
                >
                  <option value="personal">Personal</option>
                  <option value="team">Team / Work</option>
                  <option value="any">Any Account</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="clone-branch">
                <GitBranch size={12} />
                Specific Branch (Optional)
              </label>
              <span className="field-hint">Leave blank to clone the default branch.</span>
              <input
                id="clone-branch"
                className="input-field mono"
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>

            {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
          </div>

          <div className="dialog-footer">
            <button
              type="button"
              className="btn"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
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

import React, { useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, Loader2, X } from 'lucide-react';
import { AccountScope, CreateProjectInput } from '../../shared/types';
import { attachDialogLightDismissFallback, syncFieldAriaValidation } from '../utils/dialogHelpers';
import { ProjectGitOptions } from './dialogs/ProjectGitOptions';

interface CreateProjectDialogProps {
  open: boolean;
  defaultParentDir: string;
  githubConnected: boolean;
  githubUsername?: string;
  onClose: () => void;
  onPickFolder: () => Promise<string | null>;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
  open,
  defaultParentDir,
  githubConnected,
  githubUsername,
  onClose,
  onPickFolder,
  onCreate,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [scope, setScope] = useState<AccountScope>('personal');
  const [template, setTemplate] = useState<CreateProjectInput['template']>('blank');
  const [initGit, setInitGit] = useState(true);
  const [createGitHubRepo, setCreateGitHubRepo] = useState(false);
  const [githubPrivate, setGithubPrivate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parentDir && defaultParentDir) setParentDir(defaultParentDir);
  }, [defaultParentDir, parentDir]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) { setError(null); el.showModal(); }
    else if (!open && el.open) el.close();
  }, [open]);

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
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        parentDir: parentDir.trim(),
        scope,
        template,
        initGit: initGit || createGitHubRepo,
        createGitHubRepo,
        githubPrivate,
      });
      setName(''); setDescription('');
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="sb-dialog" aria-labelledby={titleId} {...({ closedby: 'any' } as Record<string, string>)}>
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>Create New Project</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
          <div className="dialog-body scroller">
            <div className="field-row-2">
              <div className="field">
                <label htmlFor="proj-name">Project Name</label>
                <span id="proj-name-hint" className="field-hint">Used for the folder &amp; GitHub repo slug.</span>
                <input id="proj-name" className="input-field" type="text" required minLength={2} placeholder="my-awesome-app" value={name} aria-invalid="false" aria-describedby="proj-name-hint" data-error="proj-name-error" onChange={(e) => { setName(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
                <div id="proj-name-error" className="field-error">Please enter a project name (min 2 chars).</div>
              </div>
              <div className="field">
                <label htmlFor="proj-scope">Workspace Scope</label>
                <span className="field-hint">Controls Personal vs Team account routing.</span>
                <select id="proj-scope" className="select-compact" value={scope} onChange={(e) => setScope(e.target.value as AccountScope)}>
                  <option value="personal">Personal</option>
                  <option value="team">Team / Work</option>
                  <option value="any">Any Account</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="proj-desc">Description (Optional)</label>
              <span className="field-hint">Added to README.md and GitHub repository metadata.</span>
              <input id="proj-desc" className="input-field" type="text" placeholder="Short summary of what this project does" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="proj-parent">Parent Directory</label>
              <span id="proj-parent-hint" className="field-hint">A new folder for this project will be created inside this directory.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="proj-parent" className="input-field mono" style={{ flex: 1 }} type="text" required value={parentDir} aria-invalid="false" aria-describedby="proj-parent-hint" data-error="proj-parent-error" onChange={(e) => { setParentDir(e.target.value); syncFieldAriaValidation(e.target); }} onBlur={(e) => syncFieldAriaValidation(e.target)} />
                <button type="button" className="btn btn-sm" onClick={async () => { const picked = await onPickFolder(); if (picked) setParentDir(picked); }}>
                  <FolderOpen size={14} /> Browse
                </button>
              </div>
              <div id="proj-parent-error" className="field-error">Please choose a parent folder.</div>
            </div>
            <div className="field">
              <label htmlFor="proj-template">Starter Template</label>
              <select id="proj-template" className="select-compact" value={template} onChange={(e) => setTemplate(e.target.value as CreateProjectInput['template'])}>
                <option value="blank">Blank (README.md + .gitignore)</option>
                <option value="node-ts">Node.js + TypeScript Starter</option>
                <option value="web-vite">Web App (Vite Starter)</option>
              </select>
            </div>
            <ProjectGitOptions
              initGit={initGit}
              createGitHubRepo={createGitHubRepo}
              githubPrivate={githubPrivate}
              githubConnected={githubConnected}
              githubUsername={githubUsername}
              onChangeInitGit={setInitGit}
              onChangeCreateGitHubRepo={setCreateGitHubRepo}
              onChangeGitHubPrivate={setGithubPrivate}
            />
            {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting && <Loader2 size={13} className="spin" />}
              {createGitHubRepo ? 'Create & Push to GitHub' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};

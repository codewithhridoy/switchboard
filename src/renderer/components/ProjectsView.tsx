import React, { useState } from 'react';
import {
  ArrowRight,
  Download,
  ExternalLink,
  FolderGit2,
  FolderPlus,
  Github,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import { ProjectWorkspace, SwitchboardState } from '../../shared/types';

interface ProjectsViewProps {
  state: SwitchboardState;
  onOpenCreateProject: () => void;
  onOpenCloneRepo: () => void;
  onImportFolder: () => Promise<void>;
  onOpenProjectInDeck: (projectId: string) => void;
  onPushToGitHub: (projectId: string, isPrivate: boolean) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  state,
  onOpenCreateProject,
  onOpenCloneRepo,
  onImportFolder,
  onOpenProjectInDeck,
  onPushToGitHub,
  onDeleteProject,
  onOpenExternal,
}) => {
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const handlePush = async (project: ProjectWorkspace, isPrivate: boolean) => {
    setPushingId(project.id);
    try {
      await onPushToGitHub(project.id, isPrivate);
      setFeedback((prev) => ({
        ...prev,
        [project.id]: { ok: true, msg: 'Created GitHub repo & pushed main!' },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [project.id]: {
          ok: false,
          msg: err instanceof Error ? err.message : String(err),
        },
      }));
    } finally {
      setPushingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ fontSize: 13.5 }}>
            Projects & Persistent Workspaces ({state.projects.length})
          </strong>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Each project keeps its own multi-turn chat threads, workspace folder, scope guard, and GitHub link — all synced via GitHub Sync.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={onOpenCloneRepo}>
            <Download size={14} />
            Clone Repo
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void onImportFolder()}>
            <FolderPlus size={14} />
            Import Existing Folder
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenCreateProject}>
            <Plus size={14} />
            New Project
          </button>
        </div>
      </div>

      {state.projects.length === 0 ? (
        <div className="card empty-state" style={{ minHeight: 280 }}>
          <FolderGit2 size={30} style={{ opacity: 0.45 }} />
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            No projects added yet
          </div>
          <div style={{ fontSize: 12.5, maxWidth: 440 }}>
            Clone a repository from GitHub or any Git URL, import an existing folder on your Mac, or create a brand new project with persistent multi-model chat threads.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={onOpenCloneRepo}>
              <Download size={14} />
              Clone Repo
            </button>
            <button type="button" className="btn" onClick={() => void onImportFolder()}>
              <FolderPlus size={14} />
              Import Folder
            </button>
            <button type="button" className="btn btn-primary" onClick={onOpenCreateProject}>
              <Plus size={14} />
              Create New Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {state.projects.map((proj) => {
            const threadCount = state.threads.filter((t) => t.projectId === proj.id).length;
            const taskCount = state.tasks.filter((t) => t.projectId === proj.id).length;
            const fb = feedback[proj.id];

            return (
              <article key={proj.id} className="card account-card">
                <div className="account-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FolderGit2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <strong style={{ fontSize: 14.5 }}>{proj.name}</strong>
                      <span className="pill">{proj.scope}</span>
                    </div>
                    {proj.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {proj.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="account-meta-box">
                  <div className="mono" style={{ wordBreak: 'break-all' }}>
                    {proj.path}
                  </div>
                  {proj.githubRepoUrl && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{
                        justifyContent: 'flex-start',
                        padding: '2px 0',
                        color: 'var(--accent)',
                      }}
                      onClick={() => void onOpenExternal(proj.githubRepoUrl!)}
                    >
                      <Github size={12} />
                      <span>{proj.githubFullName || proj.githubRepoUrl}</span>
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="pill">
                    <MessageSquare size={11} />
                    {threadCount} thread{threadCount === 1 ? '' : 's'}
                  </span>
                  <span className="pill">
                    {taskCount} turn{taskCount === 1 ? '' : 's'}
                  </span>
                </div>

                {fb && (
                  <div
                    style={{
                      fontSize: 12,
                      color: fb.ok ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {fb.msg}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onOpenProjectInDeck(proj.id)}
                  >
                    Open Chats
                    <ArrowRight size={13} />
                  </button>

                  {!proj.githubRepoUrl && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={pushingId === proj.id}
                        onClick={() => void handlePush(proj, true)}
                      >
                        {pushingId === proj.id ? (
                          <Loader2 size={12} className="spin" />
                        ) : (
                          <Github size={13} />
                        )}
                        Push Private
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={pushingId === proj.id}
                        onClick={() => void handlePush(proj, false)}
                      >
                        Push Public
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', color: 'var(--danger)' }}
                    onClick={() => void onDeleteProject(proj.id)}
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

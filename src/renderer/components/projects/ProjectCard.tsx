import React, { useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  FolderGit2,
  Github,
  Loader2,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { ProjectWorkspace } from '../../../shared/types';

interface ProjectCardProps {
  project: ProjectWorkspace;
  threadCount: number;
  taskCount: number;
  onOpenProjectInDeck: (projectId: string) => void;
  onPushToGitHub: (projectId: string, isPrivate: boolean) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project: proj,
  threadCount,
  taskCount,
  onOpenProjectInDeck,
  onPushToGitHub,
  onDeleteProject,
  onOpenExternal,
}) => {
  const [pushing, setPushing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const handlePush = async (isPrivate: boolean) => {
    setPushing(true);
    try {
      await onPushToGitHub(proj.id, isPrivate);
      setFeedback({ ok: true, msg: 'Created GitHub repo & pushed main!' });
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setPushing(false);
    }
  };

  return (
    <article className="card account-card">
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
        <div className="mono" style={{ wordBreak: 'break-all' }}>{proj.path}</div>
        {proj.githubRepoUrl && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: 'flex-start', padding: '2px 0', color: 'var(--accent)' }}
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
          <MessageSquare size={11} /> {threadCount} thread{threadCount === 1 ? '' : 's'}
        </span>
        <span className="pill">{taskCount} turn{taskCount === 1 ? '' : 's'}</span>
      </div>

      {feedback && (
        <div style={{ fontSize: 12, color: feedback.ok ? 'var(--success)' : 'var(--danger)' }}>
          {feedback.msg}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenProjectInDeck(proj.id)}>
          Open Chats <ArrowRight size={13} />
        </button>

        {!proj.githubRepoUrl && (
          <>
            <button type="button" className="btn btn-sm" disabled={pushing} onClick={() => void handlePush(true)}>
              {pushing ? <Loader2 size={12} className="spin" /> : <Github size={13} />}
              Push Private
            </button>
            <button type="button" className="btn btn-sm" disabled={pushing} onClick={() => void handlePush(false)}>
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
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </article>
  );
};

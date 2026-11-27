import React from 'react';
import { Download, FolderGit2, FolderPlus, Plus } from 'lucide-react';
import { SwitchboardState } from '../../shared/types';
import { ProjectCard } from './projects/ProjectCard';

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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ fontSize: 13.5 }}>Projects &amp; Persistent Workspaces ({state.projects.length})</strong>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Each project keeps its own multi-turn chat threads, workspace folder, scope guard, and
          GitHub link — all synced via GitHub Sync.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={onOpenCloneRepo}>
          <Download size={14} /> Clone Repo
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void onImportFolder()}>
          <FolderPlus size={14} /> Import Existing Folder
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenCreateProject}>
          <Plus size={14} /> New Project
        </button>
      </div>
    </div>

    {state.projects.length === 0 ? (
      <div className="card empty-state" style={{ minHeight: 280 }}>
        <FolderGit2 size={30} style={{ opacity: 0.45 }} />
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>No projects added yet</div>
        <div style={{ fontSize: 12.5, maxWidth: 440 }}>
          Clone a repository from GitHub or any Git URL, import an existing folder on your Mac, or
          create a brand new project with persistent multi-model chat threads.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={onOpenCloneRepo}>
            <Download size={14} /> Clone Repo
          </button>
          <button type="button" className="btn" onClick={() => void onImportFolder()}>
            <FolderPlus size={14} /> Import Folder
          </button>
          <button type="button" className="btn btn-primary" onClick={onOpenCreateProject}>
            <Plus size={14} /> Create New Project
          </button>
        </div>
      </div>
    ) : (
      <div className="grid-2">
        {state.projects.map((proj) => (
          <ProjectCard
            key={proj.id}
            project={proj}
            threadCount={state.threads.filter((t) => t.projectId === proj.id).length}
            taskCount={state.tasks.filter((t) => t.projectId === proj.id).length}
            onOpenProjectInDeck={onOpenProjectInDeck}
            onPushToGitHub={onPushToGitHub}
            onDeleteProject={onDeleteProject}
            onOpenExternal={onOpenExternal}
          />
        ))}
      </div>
    )}
  </div>
);

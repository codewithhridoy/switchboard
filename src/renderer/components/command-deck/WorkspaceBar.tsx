import React from 'react';
import { FolderOpen, MessageSquarePlus } from 'lucide-react';
import { CodingPermissionMode, ProjectWorkspace } from '../../../shared/types';

interface WorkspaceBarProps {
  projects: ProjectWorkspace[];
  activeProjectId: string | null;
  mode: 'coding' | 'general';
  workspaceDir: string;
  permissionMode: CodingPermissionMode;
  onSelectProject: (projectId: string | null) => void;
  onChangeMode: (mode: 'coding' | 'general') => void;
  onPickFolder: () => Promise<void>;
  onChangePermissionMode: (mode: CodingPermissionMode) => void;
  onStartNewChat: () => Promise<void>;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  projects,
  activeProjectId,
  mode,
  workspaceDir,
  permissionMode,
  onSelectProject,
  onChangeMode,
  onPickFolder,
  onChangePermissionMode,
  onStartNewChat,
}) => (
  <div className="card workspace-bar">
    <div className="composer-group">
      <select
        className="select-compact"
        aria-label="Active project"
        value={activeProjectId ?? ''}
        onChange={(e) => onSelectProject(e.target.value || null)}
      >
        <option value="">Workspace: General (All)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            Project: {p.name}
          </option>
        ))}
      </select>

      <div className="segmented" role="group" aria-label="Task mode">
        <button
          type="button"
          className={mode === 'coding' ? 'active' : ''}
          onClick={() => onChangeMode('coding')}
        >
          Coding
        </button>
        <button
          type="button"
          className={mode === 'general' ? 'active' : ''}
          onClick={() => onChangeMode('general')}
        >
          General
        </button>
      </div>

      {mode === 'coding' && (
        <>
          <button
            type="button"
            className="btn btn-sm"
            title={workspaceDir || 'Select workspace folder'}
            onClick={() => void onPickFolder()}
          >
            <FolderOpen size={13} />
            <span
              className="mono"
              style={{
                maxWidth: 165,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {workspaceDir ? workspaceDir.split(/[\\/]/).slice(-2).join('/') : 'Choose Folder'}
            </span>
          </button>

          <select
            className="select-compact"
            aria-label="Coding agent permissions"
            value={permissionMode}
            onChange={(e) => onChangePermissionMode(e.target.value as CodingPermissionMode)}
            title="Full Auto allows file edits and shell commands (git/pnpm/tests); Edits Only blocks shell commands"
          >
            <option value="full-auto">Full Auto (Edits + Shell)</option>
            <option value="accept-edits">Edits Only (No Shell)</option>
            <option value="read-only">Plan / Read-Only</option>
          </select>
        </>
      )}
    </div>

    <button type="button" className="btn btn-primary btn-sm" onClick={() => void onStartNewChat()}>
      <MessageSquarePlus size={13} />
      New Chat
    </button>
  </div>
);

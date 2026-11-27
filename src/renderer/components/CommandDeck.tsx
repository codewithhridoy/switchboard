import React from 'react';
import {
  ChatThread,
  CodingPermissionMode,
  CreatePrInput,
  CreateTaskInput,
  GitHubPullRequestInfo,
  GitWorkspaceStatus,
  MergePrInput,
  MergePrResult,
  OrchestratedTask,
  SwitchboardState,
  TaskAttachment,
} from '../../shared/types';
import { GitChangesPanel } from './GitChangesPanel';
import { ChatReplyComposer } from './command-deck/ChatReplyComposer';
import { ChatThreadSidebar } from './command-deck/ChatThreadSidebar';
import { ChatTurnList } from './command-deck/ChatTurnList';
import { InspectorHeader } from './command-deck/InspectorHeader';
import { WorkspaceBar } from './command-deck/WorkspaceBar';
import { useCommandDeckState } from './command-deck/useCommandDeckState';

interface CommandDeckProps {
  state: SwitchboardState;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateThread: (projectId: string | null, title?: string) => Promise<ChatThread | null>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onEnqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask | null>;
  onRetryTask: (taskId: string, opts?: { permissionMode?: CodingPermissionMode }) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onPickFolder: () => Promise<string | null>;
  onPickFiles: () => Promise<TaskAttachment[]>;
  onSaveAttachment: (input: { name: string; mimeType: string; base64Data: string }) => Promise<TaskAttachment | null>;
  onGitStatus: (cwd: string) => Promise<GitWorkspaceStatus>;
  onGitFileDiff: (cwd: string, filePath: string) => Promise<string>;
  onGitCheckout: (cwd: string, branch: string, createNew?: boolean) => Promise<void>;
  onGitDiscardFile: (cwd: string, filePath: string) => Promise<void>;
  onGitCommitAll: (cwd: string, message: string) => Promise<{ commitHash: string }>;
  onGitPush: (cwd: string) => Promise<{ branch: string }>;
  onGitCreatePr: (input: CreatePrInput) => Promise<{ url: string; number: number }>;
  onGitGetCurrentPr: (cwd: string) => Promise<GitHubPullRequestInfo | null>;
  onGitMergePr: (input: MergePrInput) => Promise<MergePrResult>;
  onOpenExternal: (url: string) => Promise<void>;
}

export const CommandDeck: React.FC<CommandDeckProps> = (props) => {
  const deck = useCommandDeckState({
    state: props.state,
    activeProjectId: props.activeProjectId,
    onEnqueueTask: props.onEnqueueTask,
    onGitStatus: props.onGitStatus,
  });

  return (
    <div className="command-deck">
      <WorkspaceBar
        projects={props.state.projects}
        activeProjectId={props.activeProjectId}
        mode={deck.mode}
        workspaceDir={deck.workspaceDir}
        permissionMode={deck.permissionMode}
        onSelectProject={props.onSelectProject}
        onChangeMode={deck.setMode}
        onPickFolder={async () => { const p = await props.onPickFolder(); if (p) deck.setWorkspaceDir(p); }}
        onChangePermissionMode={deck.updatePermissionMode}
        onStartNewChat={async () => {
          const created = await props.onCreateThread(props.activeProjectId, 'New Chat');
          if (created) {
            deck.setActiveThreadId(created.id);
            deck.setInspectorTab('response');
            setTimeout(() => deck.replyInputRef.current?.focus(), 40);
          }
        }}
      />

      <div className="task-workspace">
        <ChatThreadSidebar
          threads={deck.visibleThreads}
          tasks={props.state.tasks}
          activeThreadId={deck.activeThreadId}
          onSelectThread={(id) => { deck.setActiveThreadId(id); deck.setInspectorTab('response'); }}
          onDeleteThread={props.onDeleteThread}
        />

        <section className="card task-detail-panel" aria-label="Chat and workspace changes">
          <InspectorHeader
            inspectorTab={deck.inspectorTab}
            turnCount={deck.threadTurns.length}
            gitStatus={deck.gitStatus}
            threadTitle={deck.activeThread?.title}
            onSelectResponse={() => deck.setInspectorTab('response')}
            onSelectChanges={() => { deck.setInspectorTab('changes'); void deck.refreshGit(); }}
          />

          {deck.inspectorTab === 'changes' ? (
            <GitChangesPanel
              status={deck.gitStatus}
              loading={deck.loadingGit}
              defaultCommitMessage={deck.threadTurns[deck.threadTurns.length - 1]?.title || deck.activeThread?.title}
              onRefresh={deck.refreshGit}
              onGetFileDiff={props.onGitFileDiff}
              onCheckout={props.onGitCheckout}
              onDiscardFile={props.onGitDiscardFile}
              onCommitAll={props.onGitCommitAll}
              onPush={props.onGitPush}
              onCreatePr={props.onGitCreatePr}
              onGetCurrentPr={props.onGitGetCurrentPr}
              onMergePr={props.onGitMergePr}
              onOpenExternal={props.onOpenExternal}
            />
          ) : (
            <>
              <ChatTurnList
                scrollRef={deck.chatScrollRef}
                turns={deck.threadTurns}
                nowTick={deck.nowTick}
                copiedId={deck.copiedId}
                permissionMode={deck.permissionMode}
                onSelectExample={(p, m) => { deck.setPrompt(p); deck.setMode(m); deck.replyInputRef.current?.focus(); }}
                onSwitchToFullAutoAndRetry={(id) => { deck.updatePermissionMode('full-auto'); void props.onRetryTask(id, { permissionMode: 'full-auto' }); }}
                onRetryTask={props.onRetryTask}
                onCancelTask={props.onCancelTask}
                onDeleteTask={props.onDeleteTask}
                onCopy={async (id, text) => {
                  await navigator.clipboard.writeText(text);
                  deck.setCopiedId(id);
                  setTimeout(() => deck.setCopiedId((c) => (c === id ? null : c)), 1800);
                }}
              />

              <ChatReplyComposer
                inputRef={deck.replyInputRef}
                prompt={deck.prompt}
                attachments={deck.attachments}
                hasPriorTurns={deck.threadTurns.length > 0}
                accounts={props.state.accounts}
                discoveredModels={props.state.discoveredModels}
                workspaceScope={deck.workspaceScope}
                forcedAccountId={deck.forcedAccountId}
                forcedBaseModel={deck.forcedBaseModel}
                forcedEffort={deck.forcedEffort}
                fastMode={deck.fastMode}
                autoDecompose={deck.autoDecompose}
                onChangePrompt={deck.setPrompt}
                onAddAttachments={(added) => deck.setAttachments((prev) => [...prev, ...added])}
                onRemoveAttachment={(id) => deck.setAttachments((prev) => prev.filter((a) => a.id !== id))}
                onPickFiles={props.onPickFiles}
                onSaveAttachment={props.onSaveAttachment}
                onChangeScope={deck.setWorkspaceScope}
                onChangeForcedAccount={(id) => { deck.setForcedAccountId(id); deck.setForcedBaseModel(''); deck.setForcedEffort(''); }}
                onChangeForcedModel={deck.setForcedBaseModel}
                onChangeForcedEffort={deck.setForcedEffort}
                onChangeFastMode={deck.setFastMode}
                onChangeAutoDecompose={deck.setAutoDecompose}
                onSubmit={deck.handleSubmit}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
};

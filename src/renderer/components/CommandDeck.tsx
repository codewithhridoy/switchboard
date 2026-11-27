import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  composeModelId,
  EFFORT_LABELS,
  groupModelsByBase,
  pickBestEffort,
  splitModelAndEffort,
} from '../../shared/models';
import { PROVIDER_MODELS, TASK_CATEGORY_META } from '../../shared/presets';
import {
  AccountScope,
  ChatThread,
  CodingPermissionMode,
  CreatePrInput,
  CreateTaskInput,
  EffortLevel,
  GitWorkspaceStatus,
  OrchestratedTask,
  SwitchboardState,
  TaskAttachment,
} from '../../shared/types';
import { GitChangesPanel } from './GitChangesPanel';
import { MarkdownView } from './MarkdownView';

interface CommandDeckProps {
  state: SwitchboardState;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateThread: (projectId: string | null, title?: string) => Promise<ChatThread | null>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onEnqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask | null>;
  onRetryTask: (taskId: string) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onPickFolder: () => Promise<string | null>;
  onPickFiles: () => Promise<TaskAttachment[]>;
  onSaveAttachment: (input: {
    name: string;
    mimeType: string;
    base64Data: string;
  }) => Promise<TaskAttachment | null>;
  onGitStatus: (cwd: string) => Promise<GitWorkspaceStatus>;
  onGitFileDiff: (cwd: string, filePath: string) => Promise<string>;
  onGitCheckout: (cwd: string, branch: string, createNew?: boolean) => Promise<void>;
  onGitDiscardFile: (cwd: string, filePath: string) => Promise<void>;
  onGitCommitAll: (cwd: string, message: string) => Promise<{ commitHash: string }>;
  onGitPush: (cwd: string) => Promise<{ branch: string }>;
  onGitCreatePr: (input: CreatePrInput) => Promise<{ url: string; number: number }>;
  onOpenExternal: (url: string) => Promise<void>;
}

const EXAMPLE_PROMPTS = [
  {
    label: 'Multi-step Feature Build',
    mode: 'coding' as const,
    prompt:
      '1. Inspect the repository architecture and list key files to modify.\n2. Implement the requested feature with clean TypeScript types.\n3. Write unit tests and verify everything passes.',
  },
  {
    label: 'Codebase Audit',
    mode: 'coding' as const,
    prompt:
      'Audit the entire codebase for security risks, race conditions, and dead code, then produce a prioritized refactoring checklist.',
  },
  {
    label: 'Research & Spec Draft',
    mode: 'general' as const,
    prompt:
      '1. Research and compare the top 3 approaches for local-first sync engines.\n2. Draft a concise engineering RFC recommending the best option with trade-offs.',
  },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'retrying':
    case 'planning':
      return <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />;
    case 'completed':
      return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />;
    case 'failed':
      return <XCircle size={14} style={{ color: 'var(--danger)' }} />;
    case 'cancelled':
      return <Square size={13} style={{ color: 'var(--text-muted)' }} />;
    default:
      return <Clock size={14} style={{ color: 'var(--text-muted)' }} />;
  }
}

export const CommandDeck: React.FC<CommandDeckProps> = ({
  state,
  activeProjectId,
  onSelectProject,
  onCreateThread,
  onDeleteThread,
  onEnqueueTask,
  onRetryTask,
  onCancelTask,
  onDeleteTask,
  onPickFolder,
  onPickFiles,
  onSaveAttachment,
  onGitStatus,
  onGitFileDiff,
  onGitCheckout,
  onGitDiscardFile,
  onGitCommitAll,
  onGitPush,
  onGitCreatePr,
  onOpenExternal,
}) => {
  const activeProject = state.projects.find((p) => p.id === activeProjectId) ?? null;

  // All threads for the current project (or all threads when viewing General / All)
  const visibleThreads = useMemo(() => {
    const list = activeProjectId
      ? state.threads.filter((t) => t.projectId === activeProjectId)
      : state.threads;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.threads, activeProjectId]);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    visibleThreads[0]?.id ?? null
  );
  const [inspectorTab, setInspectorTab] = useState<'response' | 'changes'>('response');
  const [gitStatus, setGitStatus] = useState<GitWorkspaceStatus | null>(null);
  const [loadingGit, setLoadingGit] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<'coding' | 'general'>('coding');
  const [permissionMode, setPermissionMode] = useState<CodingPermissionMode>('accept-edits');
  const [fastMode, setFastMode] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState(
    activeProject?.path || state.settings.defaultWorkspaceDir || ''
  );
  const [workspaceScope, setWorkspaceScope] = useState<AccountScope>(
    activeProject?.scope || 'any'
  );
  const [forcedAccountId, setForcedAccountId] = useState<string>('');
  const [forcedBaseModel, setForcedBaseModel] = useState<string>('');
  const [forcedEffort, setForcedEffort] = useState<EffortLevel | ''>('');
  const [autoDecompose, setAutoDecompose] = useState(state.settings.autoDecomposeMultiStep);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);

  const hasRunningTask = state.tasks.some(
    (t) => t.status === 'running' || t.status === 'planning'
  );

  useEffect(() => {
    if (!hasRunningTask) return;
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [hasRunningTask]);

  useEffect(() => {
    if (activeProject) {
      setWorkspaceDir(activeProject.path);
      setWorkspaceScope(activeProject.scope);
      setMode('coding');
    } else if (!workspaceDir && state.settings.defaultWorkspaceDir) {
      setWorkspaceDir(state.settings.defaultWorkspaceDir);
    }
  }, [activeProject, state.settings.defaultWorkspaceDir, workspaceDir]);

  // Keep activeThreadId valid when switching projects or deleting a thread
  useEffect(() => {
    if (activeThreadId && visibleThreads.some((t) => t.id === activeThreadId)) {
      return;
    }
    setActiveThreadId(visibleThreads[0]?.id ?? null);
  }, [activeThreadId, visibleThreads]);

  const activeThread = useMemo(
    () => visibleThreads.find((t) => t.id === activeThreadId) ?? null,
    [visibleThreads, activeThreadId]
  );

  // All turns in the currently selected chat thread, chronological (oldest -> newest)
  const threadTurns = useMemo(() => {
    if (!activeThreadId) return [];
    return state.tasks
      .filter((t) => t.threadId === activeThreadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [state.tasks, activeThreadId]);

  // Auto-scroll chat timeline smoothly when new turn arrives
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeThreadId, threadTurns.length]);

  const effectiveGitDir =
    (mode === 'coding' ? workspaceDir : '') || activeProject?.path || '';

  const refreshGit = async () => {
    if (!effectiveGitDir) {
      setGitStatus(null);
      return;
    }
    setLoadingGit(true);
    try {
      const next = await onGitStatus(effectiveGitDir);
      setGitStatus(next);
    } finally {
      setLoadingGit(false);
    }
  };

  useEffect(() => {
    void refreshGit();
  }, [effectiveGitDir, state.tasks.length, hasRunningTask]);

  const ingestBrowserFiles = async (files: File[]) => {
    for (const file of files) {
      const base64Data = await fileToBase64(file);
      const saved = await onSaveAttachment({
        name: file.name || `pasted-${Date.now()}.png`,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      });
      if (saved) {
        setAttachments((prev) => [...prev, saved]);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const pastedFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      await ingestBrowserFiles(pastedFiles);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      await ingestBrowserFiles(files);
    }
  };

  const handleStartNewChat = async () => {
    const created = await onCreateThread(activeProjectId, 'New Chat');
    if (created) {
      setActiveThreadId(created.id);
      setInspectorTab('response');
      setTimeout(() => replyInputRef.current?.focus(), 40);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = prompt.trim() || (attachments.length > 0 ? 'Analyze the attached file(s).' : '');
    if (!cleaned) return;

    let resolvedForcedModel: string | null = null;
    let resolvedForcedEffort: EffortLevel | null = null;
    if (forcedAccountId) {
      const pinned = state.accounts.find((a) => a.id === forcedAccountId);
      if (pinned) {
        const groups = groupModelsByBase(
          pinned.provider,
          state.discoveredModels?.[pinned.provider],
          PROVIDER_MODELS[pinned.provider] ?? []
        );
        const baseId = forcedBaseModel || splitModelAndEffort(pinned.model).baseId;
        const activeGroup = groups.find((g) => g.baseId === baseId);
        const effortVal = forcedEffort || undefined;
        if (activeGroup && (forcedBaseModel || effortVal)) {
          resolvedForcedModel = composeModelId(
            activeGroup,
            effortVal ?? splitModelAndEffort(pinned.model).effort ?? pinned.effort
          );
          if (!activeGroup.suffixEncoded && effortVal) {
            resolvedForcedEffort = effortVal;
          }
        }
      }
    }

    const created = await onEnqueueTask({
      prompt: cleaned,
      attachments: attachments.length > 0 ? attachments : undefined,
      projectId: activeProjectId,
      threadId: activeThreadId,
      mode,
      permissionMode: mode === 'coding' ? permissionMode : undefined,
      fastMode,
      workspaceDir: mode === 'coding' ? workspaceDir : undefined,
      workspaceScope,
      autoDecompose,
      forcedAccountId: forcedAccountId || null,
      forcedModel: resolvedForcedModel,
      forcedEffort: resolvedForcedEffort,
    });

    setPrompt('');
    setAttachments([]);
    setInspectorTab('response');
    if (created?.threadId) {
      setActiveThreadId(created.threadId);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const latestTurn = threadTurns[threadTurns.length - 1];

  return (
    <div className="command-deck">
      {/* Compact Top Workspace & Mode Bar */}
      <div className="card workspace-bar">
        <div className="composer-group">
          <select
            className="select-compact"
            aria-label="Active project"
            value={activeProjectId ?? ''}
            onChange={(e) => onSelectProject(e.target.value || null)}
          >
            <option value="">Workspace: General (All)</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                Project: {p.name}
              </option>
            ))}
          </select>

          <div className="segmented" role="group" aria-label="Task mode">
            <button
              type="button"
              className={mode === 'coding' ? 'active' : ''}
              onClick={() => setMode('coding')}
            >
              Coding
            </button>
            <button
              type="button"
              className={mode === 'general' ? 'active' : ''}
              onClick={() => setMode('general')}
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
                onClick={async () => {
                  const picked = await onPickFolder();
                  if (picked) setWorkspaceDir(picked);
                }}
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
                onChange={(e) => setPermissionMode(e.target.value as CodingPermissionMode)}
                title="Controls whether headless coding agents can edit files and run commands"
              >
                <option value="accept-edits">Edits: Auto-Approve</option>
                <option value="full-auto">Full Auto (Edits + Shell)</option>
                <option value="read-only">Plan / Read-Only</option>
              </select>
            </>
          )}
        </div>

        <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleStartNewChat()}>
          <MessageSquarePlus size={13} />
          New Chat
        </button>
      </div>

      {/* Main Split: Left Chats List | Right Continuous Chat + Bottom Reply + Git Changes */}
      <div className="task-workspace">
        {/* Left: Chat Threads */}
        <section className="card task-list-panel" aria-label="Chats">
          <div className="panel-header">
            <h2>Chats</h2>
            <span className="pill">{visibleThreads.length}</span>
          </div>

          {visibleThreads.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={24} style={{ opacity: 0.5 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No chats yet</div>
              <div style={{ fontSize: 12 }}>
                Type your first message below. Follow-up replies automatically continue in the same thread across models.
              </div>
            </div>
          ) : (
            <div className="task-list-scroll scroller">
              {visibleThreads.map((thr) => {
                const turns = state.tasks.filter((t) => t.threadId === thr.id);
                const newest = turns[0]; // state.tasks is newest-first
                const failovers = turns.reduce((s, t) => s + t.failoverCount, 0);
                const status = newest?.status ?? 'completed';
                return (
                  <div
                    key={thr.id}
                    className={`task-item ${activeThreadId === thr.id ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveThreadId(thr.id);
                      setInspectorTab('response');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveThreadId(thr.id);
                        setInspectorTab('response');
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                        <span style={{ marginTop: 2 }}>
                          {newest ? (
                            <StatusIcon status={status} />
                          ) : (
                            <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </span>
                        <span className="task-item-title">{thr.title}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ width: 22, height: 22, padding: 2, flexShrink: 0 }}
                        title="Delete chat thread"
                        aria-label="Delete chat thread"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDeleteThread(thr.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="task-item-meta">
                      <span>
                        {turns.length} turn{turns.length === 1 ? '' : 's'}
                      </span>
                      {newest && (
                        <span className="pill">
                          {TASK_CATEGORY_META[newest.category].shortLabel}
                        </span>
                      )}
                      {failovers > 0 && (
                        <span className="pill pill-warning">
                          {failovers} failover{failovers > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Continuous Multi-Turn Chat & Git Changes */}
        <section className="card task-detail-panel" aria-label="Chat and workspace changes">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div className="segmented" role="tablist" aria-label="Workspace inspector view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'response'}
                  className={inspectorTab === 'response' ? 'active' : ''}
                  onClick={() => setInspectorTab('response')}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <MessageSquare size={12} />
                    Chat{threadTurns.length > 0 ? ` (${threadTurns.length})` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'changes'}
                  className={inspectorTab === 'changes' ? 'active' : ''}
                  onClick={() => {
                    setInspectorTab('changes');
                    void refreshGit();
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FileDiff size={12} />
                    Changes
                    {gitStatus?.isGitRepo && gitStatus.files.length > 0 && (
                      <span className="pill pill-accent" style={{ padding: '0 6px', fontSize: 10.5 }}>
                        {gitStatus.files.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>

              {gitStatus?.isGitRepo && (
                <span className="pill mono" title={`Current branch in ${gitStatus.cwd}`}>
                  <GitBranch size={11} />
                  {gitStatus.currentBranch}
                </span>
              )}
            </div>

            {activeThread && (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 260,
                }}
                title={activeThread.title}
              >
                {activeThread.title}
              </span>
            )}
          </div>

          {inspectorTab === 'changes' ? (
            <GitChangesPanel
              status={gitStatus}
              loading={loadingGit}
              defaultCommitMessage={latestTurn?.title || activeThread?.title}
              onRefresh={refreshGit}
              onGetFileDiff={onGitFileDiff}
              onCheckout={onGitCheckout}
              onDiscardFile={onGitDiscardFile}
              onCommitAll={onGitCommitAll}
              onPush={onGitPush}
              onCreatePr={onGitCreatePr}
              onOpenExternal={onOpenExternal}
            />
          ) : (
            <>
              {/* Scrollable Multi-Turn Conversation Timeline */}
              <div ref={chatScrollRef} className="task-detail-scroll scroller">
                {threadTurns.length === 0 ? (
                  <div className="empty-state">
                    <Sparkles size={26} style={{ color: 'var(--accent)', opacity: 0.7 }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                      Start a conversation
                    </div>
                    <div style={{ fontSize: 12.5, maxWidth: 420 }}>
                      Switchboard chooses the best model for every turn, keeps multi-turn memory even when switching between Claude and Gemini, and fails over automatically if any account hits a limit.
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                      {EXAMPLE_PROMPTS.map((ex) => (
                        <button
                          key={ex.label}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setPrompt(ex.prompt);
                            setMode(ex.mode);
                            replyInputRef.current?.focus();
                          }}
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  threadTurns.map((turn) => (
                    <div key={turn.id} className="chat-turn-block">
                      {/* User Bubble */}
                      <div className="user-prompt-bubble">
                        {turn.attachments && turn.attachments.length > 0 && (
                          <div className="bubble-attachments">
                            {turn.attachments.map((att) =>
                              att.isImage && att.previewDataUrl ? (
                                <img
                                  key={att.id}
                                  src={att.previewDataUrl}
                                  alt={att.name}
                                  className="bubble-img-preview"
                                />
                              ) : (
                                <span key={att.id} className="pill mono">
                                  <FileText size={11} />
                                  {att.name}
                                </span>
                              )
                            )}
                          </div>
                        )}
                        <div>{turn.prompt}</div>
                      </div>

                      {turn.error && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--danger-soft)',
                            color: 'var(--danger)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            fontSize: 12.5,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={15} />
                            <span>{turn.error}</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void onRetryTask(turn.id)}
                          >
                            <RefreshCw size={12} />
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Assistant Subtask Cards */}
                      {turn.subtasks.map((sub) => {
                        const meta = TASK_CATEGORY_META[sub.category];
                        const isRunning = sub.status === 'running' || sub.status === 'retrying';
                        const elapsedSec = sub.startedAt
                          ? (((sub.completedAt ?? nowTick) - sub.startedAt) / 1000).toFixed(1)
                          : null;

                        return (
                          <article key={sub.id} className="subtask-card">
                            <div className="subtask-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <StatusIcon status={sub.status} />
                                <strong style={{ fontSize: 13 }}>
                                  {turn.subtasks.length > 1
                                    ? `Step ${sub.index + 1}: ${sub.title}`
                                    : sub.assignedAccountName || 'Assistant'}
                                </strong>
                                <span className="pill">{meta.shortLabel}</span>
                                {elapsedSec && (
                                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {elapsedSec}s
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                {sub.assignedAccountName && (
                                  <span className="pill pill-accent mono">
                                    {sub.assignedAccountName} · {sub.assignedModel}
                                  </span>
                                )}
                                {(turn.status === 'running' || turn.status === 'queued') && (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => void onCancelTask(turn.id)}
                                  >
                                    <Square size={11} />
                                    Stop
                                  </button>
                                )}
                                {(turn.status === 'failed' || turn.status === 'cancelled') && (
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => void onRetryTask(turn.id)}
                                  >
                                    <RefreshCw size={11} />
                                    Retry
                                  </button>
                                )}
                                {sub.output && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => void handleCopy(sub.id, sub.output)}
                                  >
                                    <Copy size={12} />
                                    {copiedId === sub.id ? 'Copied' : 'Copy'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-icon"
                                  style={{ width: 24, height: 24 }}
                                  title="Delete this turn"
                                  aria-label="Delete turn"
                                  onClick={() => void onDeleteTask(turn.id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {sub.attempts.length > 1 && (
                              <div className="attempt-trail">
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                  Failover Trail:
                                </span>
                                {sub.attempts.map((att, idx) => (
                                  <React.Fragment key={`${sub.id}-${att.attemptNumber}`}>
                                    {idx > 0 && <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />}
                                    <span
                                      className={`pill ${
                                        att.status === 'completed'
                                          ? 'pill-success'
                                          : att.status === 'rate-limited'
                                            ? 'pill-warning'
                                            : att.status === 'failed'
                                              ? 'pill-danger'
                                              : 'pill-accent'
                                      }`}
                                      title={att.reason || att.model}
                                    >
                                      {att.accountName}
                                      {att.status === 'rate-limited'
                                        ? ' (Limit Hit)'
                                        : att.status === 'failed'
                                          ? ' (Error)'
                                          : ''}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            )}

                            {isRunning && sub.output && (
                              <div className="streaming-status-bar" role="status" aria-live="polite">
                                <span className="thinking-pill" style={{ fontSize: 11.5 }}>
                                  <span className="thinking-orb" />
                                  <span>{sub.liveStatus || 'Streaming response...'}</span>
                                </span>
                                {elapsedSec && <span className="mono">{elapsedSec}s</span>}
                              </div>
                            )}

                            {isRunning && !sub.output ? (
                              <div className="live-thinking-box" role="status" aria-live="polite">
                                <div className="thinking-status-row">
                                  <span className="thinking-pill">
                                    <span className="thinking-orb" />
                                    <span>
                                      {sub.liveStatus ||
                                        `Thinking with ${sub.assignedAccountName ?? 'model'}...`}
                                    </span>
                                  </span>
                                  {elapsedSec && <span className="mono">{elapsedSec}s</span>}
                                </div>
                                <div className="shimmer-lines" aria-hidden="true">
                                  <div className="shimmer-line" style={{ width: '92%' }} />
                                  <div className="shimmer-line" style={{ width: '78%' }} />
                                  <div className="shimmer-line" style={{ width: '61%' }} />
                                </div>
                              </div>
                            ) : sub.output ? (
                              <div className="assistant-response-body">
                                <MarkdownView text={sub.output} streaming={isRunning} />
                              </div>
                            ) : (
                              <div
                                style={{
                                  padding: '14px 16px',
                                  fontSize: 12.5,
                                  color: 'var(--text-secondary)',
                                  background: 'var(--bg-surface)',
                                }}
                              >
                                {sub.status === 'pending'
                                  ? 'Queued — waiting for previous step...'
                                  : sub.error || 'No output.'}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Docked Bottom Reply Composer (Claude / ChatGPT Style!) */}
              <form
                className={`chat-reply-dock ${dragOver ? 'drag-over' : ''}`}
                onSubmit={handleSubmit}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dragOver) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => void handleDrop(e)}
              >
                {attachments.length > 0 && (
                  <div className="attachment-strip">
                    {attachments.map((att) => (
                      <div key={att.id} className="attachment-chip" title={att.path}>
                        {att.isImage && att.previewDataUrl ? (
                          <img src={att.previewDataUrl} alt={att.name} className="attachment-thumb" />
                        ) : (
                          <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {att.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                            {Math.max(1, Math.round(att.size / 1024))} KB
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          style={{ width: 22, height: 22, padding: 2 }}
                          aria-label={`Remove ${att.name}`}
                          onClick={() =>
                            setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={replyInputRef}
                  className="composer-textarea scroller"
                  style={{ minHeight: 58, maxHeight: 160 }}
                  placeholder={
                    threadTurns.length > 0
                      ? 'Reply to continue this chat (remembers prior turns even across model switches)... ⌘V to paste images · ⌘/Ctrl + Enter to send'
                      : 'Ask anything, paste screenshots (⌘V), or drop files... (⌘/Ctrl + Enter to send)'
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onPaste={(e) => void handlePaste(e)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      void handleSubmit();
                    }
                  }}
                />

                <div className="composer-controls">
                  <div className="composer-group">
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Attach images, PDFs, or code files (or paste images with ⌘V)"
                      onClick={async () => {
                        const picked = await onPickFiles();
                        if (picked.length > 0) {
                          setAttachments((prev) => [...prev, ...picked]);
                        }
                      }}
                    >
                      <Paperclip size={13} />
                      Attach{attachments.length > 0 ? ` (${attachments.length})` : ''}
                    </button>

                    <select
                      className="select-compact"
                      aria-label="Account scope"
                      value={workspaceScope}
                      onChange={(e) => setWorkspaceScope(e.target.value as AccountScope)}
                    >
                      <option value="any">Scope: Any</option>
                      <option value="team">Scope: Team First</option>
                      <option value="personal">Scope: Personal First</option>
                    </select>

                    <select
                      className="select-compact"
                      aria-label="Routing mode"
                      value={forcedAccountId}
                      onChange={(e) => {
                        setForcedAccountId(e.target.value);
                        setForcedBaseModel('');
                        setForcedEffort('');
                      }}
                    >
                      <option value="">Routing: Auto</option>
                      {[...state.accounts]
                        .sort((a, b) => a.priority - b.priority)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            Pin: {acc.name}
                          </option>
                        ))}
                    </select>

                    {forcedAccountId && (() => {
                      const pinned = state.accounts.find((a) => a.id === forcedAccountId);
                      if (!pinned) return null;
                      const groups = groupModelsByBase(
                        pinned.provider,
                        state.discoveredModels?.[pinned.provider],
                        PROVIDER_MODELS[pinned.provider] ?? []
                      );
                      const parsedDefault = splitModelAndEffort(pinned.model);
                      const currentBase = forcedBaseModel || parsedDefault.baseId;
                      const activeGroup = groups.find((g) => g.baseId === currentBase);
                      return (
                        <>
                          <select
                            className="select-compact"
                            aria-label="Model override"
                            value={forcedBaseModel}
                            onChange={(e) => {
                              const nextBase = e.target.value;
                              setForcedBaseModel(nextBase);
                              const nextGroup = groups.find((g) => g.baseId === nextBase);
                              if (
                                nextGroup &&
                                forcedEffort &&
                                !nextGroup.efforts.includes(forcedEffort)
                              ) {
                                setForcedEffort(pickBestEffort(nextGroup) ?? '');
                              }
                            }}
                          >
                            <option value="">
                              {activeGroup?.label ?? parsedDefault.baseId}
                            </option>
                            {groups.map((g) => (
                              <option key={g.baseId} value={g.baseId}>
                                {g.label}
                              </option>
                            ))}
                          </select>

                          {activeGroup && activeGroup.efforts.length > 0 && (
                            <select
                              className="select-compact"
                              aria-label="Effort override"
                              value={forcedEffort}
                              onChange={(e) =>
                                setForcedEffort(e.target.value as EffortLevel | '')
                              }
                            >
                              <option value="">
                                {parsedDefault.effort
                                  ? EFFORT_LABELS[parsedDefault.effort]
                                  : pinned.effort
                                    ? EFFORT_LABELS[pinned.effort]
                                    : 'Default'}
                              </option>
                              {activeGroup.efforts.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  {EFFORT_LABELS[lvl]}
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      );
                    })()}

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: fastMode ? 'var(--accent)' : 'var(--text-secondary)',
                        fontWeight: fastMode ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fastMode}
                        onChange={(e) => setFastMode(e.target.checked)}
                      />
                      <Zap size={12} />
                      Fast
                    </label>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoDecompose}
                        onChange={(e) => setAutoDecompose(e.target.checked)}
                      />
                      Split steps
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={
                      (!prompt.trim() && attachments.length === 0) || state.accounts.length === 0
                    }
                  >
                    <Send size={13} />
                    {threadTurns.length > 0 ? 'Reply' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result ?? '');
      const comma = str.indexOf(',');
      resolve(comma >= 0 ? str.slice(comma + 1) : str);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

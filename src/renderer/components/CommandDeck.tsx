import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { TASK_CATEGORY_META } from '../../shared/presets';
import {
  AccountScope,
  CreateTaskInput,
  OrchestratedTask,
  SwitchboardState,
} from '../../shared/types';

interface CommandDeckProps {
  state: SwitchboardState;
  onEnqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask | null>;
  onRetryTask: (taskId: string) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onPickFolder: () => Promise<string | null>;
}

const EXAMPLE_PROMPTS = [
  {
    label: 'Multi-step Feature Build',
    mode: 'coding' as const,
    prompt:
      '1. Inspect the repository architecture and list key files to modify.\n2. Implement the requested feature with clean TypeScript types.\n3. Write unit tests and verify everything passes.',
  },
  {
    label: 'Large Codebase Audit',
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
  onEnqueueTask,
  onRetryTask,
  onCancelTask,
  onDeleteTask,
  onPickFolder,
}) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'coding' | 'general'>('coding');
  const [workspaceDir, setWorkspaceDir] = useState(state.settings.defaultWorkspaceDir || '');
  const [workspaceScope, setWorkspaceScope] = useState<AccountScope>('any');
  const [forcedAccountId, setForcedAccountId] = useState<string>('');
  const [autoDecompose, setAutoDecompose] = useState(state.settings.autoDecomposeMultiStep);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    state.tasks[0]?.id ?? null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const detailEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!workspaceDir && state.settings.defaultWorkspaceDir) {
      setWorkspaceDir(state.settings.defaultWorkspaceDir);
    }
  }, [state.settings.defaultWorkspaceDir, workspaceDir]);

  const selectedTask = useMemo(() => {
    if (selectedTaskId) {
      const found = state.tasks.find((t) => t.id === selectedTaskId);
      if (found) return found;
    }
    return state.tasks[0] ?? null;
  }, [selectedTaskId, state.tasks]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = prompt.trim();
    if (!cleaned) return;
    const created = await onEnqueueTask({
      prompt: cleaned,
      mode,
      workspaceDir: mode === 'coding' ? workspaceDir : undefined,
      workspaceScope,
      autoDecompose,
      forcedAccountId: forcedAccountId || null,
    });
    setPrompt('');
    if (created) {
      setSelectedTaskId(created.id);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  return (
    <div className="command-deck">
      <form className="card composer-card" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: 13.5 }}>Assign a Task</strong>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Switchboard picks the best model per step and fails over automatically when limits hit.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11.5 }}
                onClick={() => {
                  setPrompt(ex.prompt);
                  setMode(ex.mode);
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="composer-textarea scroller"
          placeholder="Describe your task — numbered steps (1., 2., 3.) are automatically split and routed to the ideal model for each phase... (⌘/Ctrl + Enter to run)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              void handleSubmit();
            }
          }}
        />

        <div className="composer-controls">
          <div className="composer-group">
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
                    maxWidth: 190,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {workspaceDir ? workspaceDir.split(/[\\/]/).slice(-2).join('/') : 'Choose Folder'}
                </span>
              </button>
            )}

            <select
              className="select-compact"
              aria-label="Account scope"
              value={workspaceScope}
              onChange={(e) => setWorkspaceScope(e.target.value as AccountScope)}
              title="Workspace scope guard (Personal vs Team)"
            >
              <option value="any">Scope: Any Account</option>
              <option value="team">Scope: Team First</option>
              <option value="personal">Scope: Personal First</option>
            </select>

            <select
              className="select-compact"
              aria-label="Routing mode"
              value={forcedAccountId}
              onChange={(e) => setForcedAccountId(e.target.value)}
            >
              <option value="">Routing: Auto (Best Model)</option>
              {state.accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  Pin: {acc.name} ({acc.model})
                </option>
              ))}
            </select>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
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
              Auto-split steps
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!prompt.trim() || state.accounts.length === 0}
          >
            <Play size={14} />
            Queue & Run
          </button>
        </div>
      </form>

      <div className="task-workspace">
        {/* Left: Task Queue */}
        <section className="card task-list-panel" aria-label="Task queue">
          <div className="panel-header">
            <h2>Task Queue</h2>
            <span className="pill">{state.tasks.length} total</span>
          </div>

          {state.tasks.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={24} style={{ opacity: 0.5 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No tasks yet</div>
              <div style={{ fontSize: 12 }}>
                Submit a single or multi-step task above. Switchboard will execute steps one by one and switch accounts automatically on limits.
              </div>
            </div>
          ) : (
            <div className="task-list-scroll scroller">
              {state.tasks.map((task) => {
                const doneSteps = task.subtasks.filter((s) => s.status === 'completed').length;
                const catMeta = TASK_CATEGORY_META[task.category];
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`task-item ${selectedTask?.id === task.id ? 'active' : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ marginTop: 2 }}>
                        <StatusIcon status={task.status} />
                      </span>
                      <span className="task-item-title">{task.title}</span>
                    </div>
                    <div className="task-item-meta">
                      <span className="pill">{catMeta.shortLabel}</span>
                      <span>
                        {doneSteps}/{task.subtasks.length} step{task.subtasks.length === 1 ? '' : 's'}
                      </span>
                      {task.failoverCount > 0 && (
                        <span className="pill pill-warning">
                          {task.failoverCount} failover{task.failoverCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Execution Inspector */}
        <section className="card task-detail-panel" aria-label="Execution inspector">
          {!selectedTask ? (
            <div className="empty-state">
              <Shield size={26} style={{ opacity: 0.45 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Execution Inspector
              </div>
              <div style={{ fontSize: 12.5, maxWidth: 380 }}>
                Select a task to inspect model routing decisions, live streaming output, and automatic failover handoffs.
              </div>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusIcon status={selectedTask.status} />
                    <h2
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {selectedTask.title}
                    </h2>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      marginTop: 3,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>Category: {TASK_CATEGORY_META[selectedTask.category].label}</span>
                    <span>•</span>
                    <span>Scope: {selectedTask.workspaceScope}</span>
                    {selectedTask.workspaceDir && (
                      <>
                        <span>•</span>
                        <span className="mono">{selectedTask.workspaceDir}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(selectedTask.status === 'running' || selectedTask.status === 'queued') && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => void onCancelTask(selectedTask.id)}
                    >
                      <Square size={12} />
                      Stop
                    </button>
                  )}
                  {(selectedTask.status === 'failed' || selectedTask.status === 'cancelled') && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void onRetryTask(selectedTask.id)}
                    >
                      <RefreshCw size={12} />
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Delete task"
                    aria-label="Delete task"
                    onClick={() => void onDeleteTask(selectedTask.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="task-detail-scroll scroller">
                {selectedTask.error && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-soft)',
                      color: 'var(--danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                    }}
                  >
                    <AlertTriangle size={15} />
                    <span>{selectedTask.error}</span>
                  </div>
                )}

                {selectedTask.subtasks.map((sub) => {
                  const meta = TASK_CATEGORY_META[sub.category];
                  return (
                    <article key={sub.id} className="subtask-card">
                      <div className="subtask-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <StatusIcon status={sub.status} />
                          <strong style={{ fontSize: 13 }}>
                            Step {sub.index + 1}: {sub.title}
                          </strong>
                          <span className="pill">{meta.shortLabel}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {sub.assignedAccountName && (
                            <span className="pill pill-accent mono">
                              {sub.assignedAccountName} · {sub.assignedModel}
                            </span>
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
                        </div>
                      </div>

                      {sub.attempts.length > 0 && (
                        <div className="attempt-trail">
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                            Execution Trail:
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

                      {sub.routingReason && (
                        <div
                          style={{
                            padding: '6px 14px',
                            fontSize: 11.5,
                            color: 'var(--text-secondary)',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          Router decision: {sub.routingReason}
                        </div>
                      )}

                      <pre className="terminal-output scroller">
                        {sub.output || (sub.status === 'pending' ? 'Waiting for previous step...' : 'Starting...')}
                      </pre>
                    </article>
                  );
                })}
                <div ref={detailEndRef} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

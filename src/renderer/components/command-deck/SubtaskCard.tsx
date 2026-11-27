import React from 'react';
import { ArrowRight, Copy, RefreshCw, Square, Trash2 } from 'lucide-react';
import { TASK_CATEGORY_META } from '../../../shared/presets';
import { CodingPermissionMode, OrchestratedTask, Subtask } from '../../../shared/types';
import { MarkdownView } from '../MarkdownView';
import { LiveActivityFeed } from './LiveActivityFeed';
import { StatusIcon } from './StatusIcon';

interface SubtaskCardProps {
  turn: OrchestratedTask;
  subtask: Subtask;
  nowTick: number;
  copiedId: string | null;
  permissionMode: CodingPermissionMode;
  onCopy: (id: string, text: string) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onRetryTask: (taskId: string, opts?: { permissionMode?: CodingPermissionMode }) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const SubtaskCard: React.FC<SubtaskCardProps> = ({
  turn,
  subtask: sub,
  nowTick,
  copiedId,
  permissionMode,
  onCopy,
  onCancelTask,
  onRetryTask,
  onDeleteTask,
}) => {
  const meta = TASK_CATEGORY_META[sub.category];
  const isRunning = sub.status === 'running' || sub.status === 'retrying';
  const elapsedSec = sub.startedAt
    ? (((sub.completedAt ?? nowTick) - sub.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <article className="subtask-card">
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
          {(turn.status === 'failed' ||
            turn.status === 'cancelled' ||
            (turn.status === 'completed' && !sub.output.trim())) && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                void onRetryTask(turn.id, turn.mode === 'coding' ? { permissionMode } : undefined)
              }
            >
              <RefreshCw size={11} />
              Retry
            </button>
          )}
          {sub.output && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void onCopy(sub.id, sub.output)}
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
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Failover Trail:</span>
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

      <LiveActivityFeed
        steps={sub.activityLog ?? []}
        isRunning={isRunning}
        liveStatus={sub.liveStatus || `Thinking with ${sub.assignedAccountName ?? 'model'}...`}
        elapsedSec={elapsedSec}
      />

      {sub.output ? (
        <div className="assistant-response-body">
          <MarkdownView text={sub.output} streaming={isRunning} />
        </div>
      ) : !isRunning ? (
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
      ) : null}
    </article>
  );
};

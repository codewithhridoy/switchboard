import React from 'react';
import { AlertTriangle, FileText, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { CodingPermissionMode, OrchestratedTask } from '../../../shared/types';
import { SubtaskCard } from './SubtaskCard';

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

interface ChatTurnListProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  turns: OrchestratedTask[];
  nowTick: number;
  copiedId: string | null;
  permissionMode: CodingPermissionMode;
  onSelectExample: (prompt: string, mode: 'coding' | 'general') => void;
  onSwitchToFullAutoAndRetry: (taskId: string) => void;
  onRetryTask: (taskId: string, opts?: { permissionMode?: CodingPermissionMode }) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onCopy: (id: string, text: string) => Promise<void>;
}

export const ChatTurnList: React.FC<ChatTurnListProps> = ({
  scrollRef,
  turns,
  nowTick,
  copiedId,
  permissionMode,
  onSelectExample,
  onSwitchToFullAutoAndRetry,
  onRetryTask,
  onCancelTask,
  onDeleteTask,
  onCopy,
}) => (
  <div ref={scrollRef} className="task-detail-scroll scroller">
    {turns.length === 0 ? (
      <div className="empty-state">
        <Sparkles size={26} style={{ color: 'var(--accent)', opacity: 0.7 }} />
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          Start a conversation
        </div>
        <div style={{ fontSize: 12.5, maxWidth: 420 }}>
          Switchboard chooses the best model for every turn, keeps multi-turn memory even when
          switching between Claude and Gemini, and fails over automatically if any account hits a
          limit.
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 6,
          }}
        >
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="btn btn-sm"
              onClick={() => onSelectExample(ex.prompt, ex.mode)}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    ) : (
      turns.map((turn) => {
        const isPermIssue =
          Boolean(turn.error) &&
          turn.mode === 'coding' &&
          turn.permissionMode !== 'full-auto' &&
          /permission|full auto|auto-denied|denied|without returning any output/i.test(
            turn.error ?? ''
          );

        return (
          <div key={turn.id} className="chat-turn-block">
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
                  gap: 10,
                  fontSize: 12.5,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{turn.error}</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {isPermIssue && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onSwitchToFullAutoAndRetry(turn.id)}
                    >
                      <Zap size={12} />
                      Switch to Full Auto &amp; Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn ${isPermIssue ? '' : 'btn-primary'} btn-sm`}
                    onClick={() =>
                      void onRetryTask(
                        turn.id,
                        turn.mode === 'coding' ? { permissionMode } : undefined
                      )
                    }
                  >
                    <RefreshCw size={12} />
                    Retry
                  </button>
                </div>
              </div>
            )}

            {turn.subtasks.map((sub) => (
              <SubtaskCard
                key={sub.id}
                turn={turn}
                subtask={sub}
                nowTick={nowTick}
                copiedId={copiedId}
                permissionMode={permissionMode}
                onCopy={onCopy}
                onCancelTask={onCancelTask}
                onRetryTask={onRetryTask}
                onDeleteTask={onDeleteTask}
              />
            ))}
          </div>
        );
      })
    )}
  </div>
);

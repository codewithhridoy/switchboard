import React from 'react';
import { MessageSquare, Sparkles, Trash2 } from 'lucide-react';
import { TASK_CATEGORY_META } from '../../../shared/presets';
import { ChatThread, OrchestratedTask } from '../../../shared/types';
import { StatusIcon } from './StatusIcon';

interface ChatThreadSidebarProps {
  threads: ChatThread[];
  tasks: OrchestratedTask[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => Promise<void>;
}

export const ChatThreadSidebar: React.FC<ChatThreadSidebarProps> = ({
  threads,
  tasks,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
}) => (
  <section className="card task-list-panel" aria-label="Chats">
    <div className="panel-header">
      <h2>Chats</h2>
      <span className="pill">{threads.length}</span>
    </div>

    {threads.length === 0 ? (
      <div className="empty-state">
        <Sparkles size={24} style={{ opacity: 0.5 }} />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No chats yet</div>
        <div style={{ fontSize: 12 }}>
          Type your first message below. Follow-up replies automatically continue in the same thread
          across models.
        </div>
      </div>
    ) : (
      <div className="task-list-scroll scroller">
        {threads.map((thr) => {
          const turns = tasks.filter((t) => t.threadId === thr.id);
          const newest = turns[0];
          const failovers = turns.reduce((s, t) => s + t.failoverCount, 0);
          const status = newest?.status ?? 'completed';
          return (
            <div
              key={thr.id}
              className={`task-item ${activeThreadId === thr.id ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectThread(thr.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectThread(thr.id);
                }
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
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
                  <span className="pill">{TASK_CATEGORY_META[newest.category].shortLabel}</span>
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
);

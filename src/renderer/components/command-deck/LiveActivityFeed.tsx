import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { SubtaskActivityStep } from '../../../shared/types';

interface LiveActivityFeedProps {
  steps: SubtaskActivityStep[];
  isRunning: boolean;
  liveStatus?: string;
  elapsedSec: string | null;
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  steps,
  isRunning,
  liveStatus,
  elapsedSec,
}) => {
  const [expanded, setExpanded] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isRunning && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [isRunning, steps.length, steps[steps.length - 1]?.detail]);

  if (!isRunning && steps.length === 0) return null;

  const showList = isRunning || expanded;

  return (
    <div className="activity-feed-wrap" role="status" aria-live="polite">
      <div className="activity-feed-head">
        {isRunning ? (
          <span className="thinking-pill" style={{ fontSize: 11.5 }}>
            <span className="thinking-orb" />
            <span>{liveStatus || 'Working step by step...'}</span>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--text-secondary)' }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>
              {steps.length} execution step{steps.length === 1 ? '' : 's'}
            </span>
          </button>
        )}
        {elapsedSec && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {elapsedSec}s
          </span>
        )}
      </div>

      {showList && (
        <div ref={feedRef} className="activity-feed-list scroller">
          {steps.length === 0 ? (
            <div className="activity-step-row">
              <Loader2 size={12} className="spin" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div className="activity-step-body">
                <span className="mono">{liveStatus || 'Connecting to model...'}</span>
                <span className="stream-caret" aria-hidden="true" />
              </div>
            </div>
          ) : (
            steps.map((step) => (
              <div key={step.id} className={`activity-step-row ${step.status}`}>
                <span className="activity-step-icon">
                  {step.status === 'running' ? (
                    <Loader2 size={12} className="spin" style={{ color: 'var(--accent)' }} />
                  ) : step.status === 'error' ? (
                    <AlertCircle size={12} style={{ color: 'var(--danger)' }} />
                  ) : step.kind === 'thinking' ? (
                    <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <Check size={12} style={{ color: 'var(--success)' }} />
                  )}
                </span>
                <div className="activity-step-body">
                  <div className="activity-step-line">
                    <span className={step.kind === 'tool' ? 'mono' : ''}>{step.label}</span>
                    {step.durationSec !== undefined && (
                      <span className="mono activity-step-dur">{step.durationSec}s</span>
                    )}
                  </div>
                  {step.detail && (
                    <div className="activity-step-detail mono">
                      {step.detail}
                      {step.status === 'running' && step.kind === 'thinking' && (
                        <span className="stream-caret" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

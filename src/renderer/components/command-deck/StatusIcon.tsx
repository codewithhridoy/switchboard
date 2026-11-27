import React from 'react';
import { CheckCircle2, Clock, Loader2, Square, XCircle } from 'lucide-react';

export const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
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
};

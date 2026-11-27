import React from 'react';
import { FileText, X } from 'lucide-react';
import { TaskAttachment } from '../../../shared/types';

interface AttachmentStripProps {
  attachments: TaskAttachment[];
  onRemove: (id: string) => void;
}

export const AttachmentStrip: React.FC<AttachmentStripProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="attachment-strip">
      {attachments.map((att) => (
        <div key={att.id} className="attachment-chip" title={att.path}>
          {att.isImage && att.previewDataUrl ? (
            <img src={att.previewDataUrl} alt={att.name} className="attachment-thumb" />
          ) : (
            <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            onClick={() => onRemove(att.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

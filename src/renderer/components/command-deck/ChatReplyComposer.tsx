import React, { useState } from 'react';
import { Paperclip, Send, Zap } from 'lucide-react';
import {
  AccountProfile,
  AccountScope,
  EffortLevel,
  ModelChoice,
  ProviderKind,
  TaskAttachment,
} from '../../../shared/types';
import { AttachmentStrip } from './AttachmentStrip';
import { RoutingSelectors } from './RoutingSelectors';

interface ChatReplyComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  prompt: string;
  attachments: TaskAttachment[];
  hasPriorTurns: boolean;
  accounts: AccountProfile[];
  discoveredModels?: Partial<Record<ProviderKind, ModelChoice[]>>;
  workspaceScope: AccountScope;
  forcedAccountId: string;
  forcedBaseModel: string;
  forcedEffort: EffortLevel | '';
  fastMode: boolean;
  autoDecompose: boolean;
  onChangePrompt: (val: string) => void;
  onAddAttachments: (files: TaskAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPickFiles: () => Promise<TaskAttachment[]>;
  onSaveAttachment: (input: { name: string; mimeType: string; base64Data: string }) => Promise<TaskAttachment | null>;
  onChangeScope: (scope: AccountScope) => void;
  onChangeForcedAccount: (accountId: string) => void;
  onChangeForcedModel: (baseModel: string) => void;
  onChangeForcedEffort: (effort: EffortLevel | '') => void;
  onChangeFastMode: (fast: boolean) => void;
  onChangeAutoDecompose: (split: boolean) => void;
  onSubmit: (e?: React.FormEvent) => Promise<void>;
}

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

export const ChatReplyComposer: React.FC<ChatReplyComposerProps> = (props) => {
  const [dragOver, setDragOver] = useState(false);

  const ingestFiles = async (files: File[]) => {
    const added: TaskAttachment[] = [];
    for (const file of files) {
      const saved = await props.onSaveAttachment({
        name: file.name || `pasted-${Date.now()}.png`,
        mimeType: file.type || 'application/octet-stream',
        base64Data: await fileToBase64(file),
      });
      if (saved) added.push(saved);
    }
    if (added.length > 0) props.onAddAttachments(added);
  };

  return (
    <form
      className={`chat-reply-dock ${dragOver ? 'drag-over' : ''}`}
      onSubmit={(e) => void props.onSubmit(e)}
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) void ingestFiles(files);
      }}
    >
      <AttachmentStrip attachments={props.attachments} onRemove={props.onRemoveAttachment} />

      <textarea
        ref={props.inputRef}
        className="composer-textarea scroller"
        style={{ minHeight: 58, maxHeight: 160 }}
        placeholder={
          props.hasPriorTurns
            ? 'Reply to continue this chat (remembers prior turns even across model switches)... ⌘V to paste images · ⌘/Ctrl + Enter to send'
            : 'Ask anything, paste screenshots (⌘V), or drop files... (⌘/Ctrl + Enter to send)'
        }
        value={props.prompt}
        onChange={(e) => props.onChangePrompt(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.items ?? [])
            .filter((i) => i.kind === 'file')
            .map((i) => i.getAsFile())
            .filter((f): f is File => Boolean(f));
          if (files.length > 0) {
            e.preventDefault();
            void ingestFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void props.onSubmit();
        }}
      />

      <div className="composer-controls">
        <div className="composer-group">
          <button
            type="button"
            className="btn btn-sm"
            title="Attach images, PDFs, or code files (or paste images with ⌘V)"
            onClick={async () => {
              const picked = await props.onPickFiles();
              if (picked.length > 0) props.onAddAttachments(picked);
            }}
          >
            <Paperclip size={13} />
            Attach{props.attachments.length > 0 ? ` (${props.attachments.length})` : ''}
          </button>

          <RoutingSelectors
            accounts={props.accounts}
            discoveredModels={props.discoveredModels}
            workspaceScope={props.workspaceScope}
            forcedAccountId={props.forcedAccountId}
            forcedBaseModel={props.forcedBaseModel}
            forcedEffort={props.forcedEffort}
            onChangeScope={props.onChangeScope}
            onChangeForcedAccount={props.onChangeForcedAccount}
            onChangeForcedModel={props.onChangeForcedModel}
            onChangeForcedEffort={props.onChangeForcedEffort}
          />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: props.fastMode ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: props.fastMode ? 600 : 400, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.fastMode} onChange={(e) => props.onChangeFastMode(e.target.checked)} />
            <Zap size={12} /> Fast
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={props.autoDecompose} onChange={(e) => props.onChangeAutoDecompose(e.target.checked)} />
            Split steps
          </label>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={(!props.prompt.trim() && props.attachments.length === 0) || props.accounts.length === 0}
        >
          <Send size={13} />
          {props.hasPriorTurns ? 'Reply' : 'Send'}
        </button>
      </div>
    </form>
  );
};

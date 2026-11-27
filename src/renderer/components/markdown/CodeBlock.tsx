import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const CodeBlock: React.FC<{ lang: string; content: string }> = ({ lang, content }) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="md-code-block">
      <div className="md-code-head">
        <span className="mono">{lang}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ padding: '2px 7px', fontSize: 11 }}
          onClick={async () => {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="md-code-pre scroller">
        <code>{content}</code>
      </pre>
    </div>
  );
};

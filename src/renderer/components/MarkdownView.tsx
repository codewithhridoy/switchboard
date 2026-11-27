import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownViewProps {
  text: string;
  streaming?: boolean;
}

type Block =
  | { kind: 'code'; lang: string; content: string }
  | { kind: 'heading'; level: number; content: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; content: string }
  | { kind: 'hr' }
  | { kind: 'p'; content: string };

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] || 'text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing ```
      blocks.push({ kind: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', content: quoteLines.join('\n') });
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph (gather contiguous non-special lines)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'p', content: pLines.join('\n') });
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Matches `code`, **bold**, *italic*, or [label](https://...)
  const tokenRe = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const full = match[0];
    if (full.startsWith('`')) {
      nodes.push(
        <code key={key++} className="md-inline-code">
          {full.slice(1, -1)}
        </code>
      );
    } else if (full.startsWith('**')) {
      nodes.push(<strong key={key++}>{full.slice(2, -2)}</strong>);
    } else if (full.startsWith('*')) {
      nodes.push(<em key={key++}>{full.slice(1, -1)}</em>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
        >
          {match[2]}
        </a>
      );
    }
    lastIdx = match.index + full.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

const CodeBlock: React.FC<{ lang: string; content: string }> = ({ lang, content }) => {
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

export const MarkdownView: React.FC<MarkdownViewProps> = ({ text, streaming }) => {
  const blocks = parseBlocks(text);

  return (
    <div className="md-body">
      {blocks.map((block, idx) => {
        const isLast = idx === blocks.length - 1;
        const caret = streaming && isLast ? <span className="stream-caret" aria-hidden="true" /> : null;

        switch (block.kind) {
          case 'code':
            return <CodeBlock key={idx} lang={block.lang} content={block.content} />;
          case 'heading': {
            const Tag = (`h${Math.min(4, Math.max(1, block.level))}` as 'h1' | 'h2' | 'h3' | 'h4');
            return (
              <Tag key={idx} className="md-heading">
                {renderInline(block.content)}
                {caret}
              </Tag>
            );
          }
          case 'ul':
            return (
              <ul key={idx} className="md-list">
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item)}
                    {isLast && j === block.items.length - 1 ? caret : null}
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx} className="md-list">
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item)}
                    {isLast && j === block.items.length - 1 ? caret : null}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={idx} className="md-quote">
                {renderInline(block.content)}
                {caret}
              </blockquote>
            );
          case 'hr':
            return <hr key={idx} className="md-hr" />;
          case 'p':
            return (
              <p key={idx} className="md-p">
                {renderInline(block.content)}
                {caret}
              </p>
            );
        }
      })}
    </div>
  );
};

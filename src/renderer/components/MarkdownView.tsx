import React from 'react';
import { CodeBlock } from './markdown/CodeBlock';
import { parseMarkdownBlocks } from './markdown/parseMarkdown';

interface MarkdownViewProps {
  text: string;
  streaming?: boolean;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRe = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) nodes.push(text.slice(lastIdx, match.index));
    const full = match[0];
    if (full.startsWith('`')) {
      nodes.push(<code key={key++} className="md-inline-code">{full.slice(1, -1)}</code>);
    } else if (full.startsWith('**')) {
      nodes.push(<strong key={key++}>{full.slice(2, -2)}</strong>);
    } else if (full.startsWith('*')) {
      nodes.push(<em key={key++}>{full.slice(1, -1)}</em>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer" className="md-link">
          {match[2]}
        </a>
      );
    }
    lastIdx = match.index + full.length;
  }

  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ text, streaming }) => {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="md-body">
      {blocks.map((block, idx) => {
        const isLast = idx === blocks.length - 1;
        const caret = streaming && isLast ? <span className="stream-caret" aria-hidden="true" /> : null;

        switch (block.kind) {
          case 'code':
            return <CodeBlock key={idx} lang={block.lang} content={block.content} />;
          case 'heading': {
            const Tag = `h${Math.min(4, Math.max(1, block.level))}` as 'h1' | 'h2' | 'h3' | 'h4';
            return <Tag key={idx} className="md-heading">{renderInline(block.content)}{caret}</Tag>;
          }
          case 'ul':
            return (
              <ul key={idx} className="md-list">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}{isLast && j === block.items.length - 1 ? caret : null}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx} className="md-list">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}{isLast && j === block.items.length - 1 ? caret : null}</li>
                ))}
              </ol>
            );
          case 'quote':
            return <blockquote key={idx} className="md-quote">{renderInline(block.content)}{caret}</blockquote>;
          case 'hr':
            return <hr key={idx} className="md-hr" />;
          case 'p':
            return <p key={idx} className="md-p">{renderInline(block.content)}{caret}</p>;
        }
      })}
    </div>
  );
};

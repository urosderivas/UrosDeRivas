import { Fragment, ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Convierte texto plano en párrafos con enlaces, sin interpretar HTML.
// Enlaces: [texto](https://...) o [texto](/events), y también URLs sueltas.
const LINK_PATTERN = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function renderLink(text: string, href: string, key: number): ReactNode {
  if (href.startsWith('/')) return <Link key={key} to={href}>{text}</Link>;
  return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
}

function renderInline(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of line.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    if (match[1]) parts.push(renderLink(match[1], match[2], key++));
    else parts.push(renderLink(match[3], match[3], key++));
    last = index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

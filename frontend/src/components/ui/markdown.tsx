import { Fragment, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function inline(text: string): ReactNode[] {
  const tokenPattern = /(`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;
  const pieces = text.split(tokenPattern);
  return pieces.map((piece, index) => {
    if (!piece) return null;
    if (piece.startsWith('`') && piece.endsWith('`')) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    const link = piece.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href
        ? <a key={index} href={href} target="_blank" rel="noreferrer">{link[1]}</a>
        : <Fragment key={index}>{link[1]}</Fragment>;
    }
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith('__') && piece.endsWith('__')) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith('~~') && piece.endsWith('~~')) return <del key={index}>{piece.slice(2, -2)}</del>;
    if (piece.startsWith('*') && piece.endsWith('*')) return <em key={index}>{piece.slice(1, -1)}</em>;
    if (piece.startsWith('_') && piece.endsWith('_')) return <em key={index}>{piece.slice(1, -1)}</em>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = inline(heading[2]);
      if (level === 1) blocks.push(<h1 key={index}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={index}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={index}>{children}</h3>);
      else blocks.push(<h4 key={index}>{children}</h4>);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(line)) {
      blocks.push(<hr key={index} />);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
      const headerCells = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes('|') && lines[index].trim()) {
        rows.push(cells(lines[index++]));
      }
      blocks.push(
        <Table key={`table-${index}`} className="markdown-table">
          <TableHeader><TableRow>{headerCells.map((cell, cellIndex) => <TableHead key={cellIndex}>{inline(cell)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex}>{headerCells.map((_, cellIndex) => <TableCell key={cellIndex}>{inline(row[cellIndex] ?? '')}</TableCell>)}</TableRow>)}</TableBody>
        </Table>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) quote.push(lines[index++].trim().replace(/^>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`}>{inline(quote.join(' '))}</blockquote>);
      continue;
    }

    const listStart = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
    if (listStart) {
      const ordered = /^\d+\./.test(listStart[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^([-*+]|\d+\.)\s+(.+)$/);
        if (!match || ordered !== /^\d+\./.test(match[1])) break;
        items.push(match[2]);
        index += 1;
      }
      blocks.push(ordered
        ? <ol key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ol>
        : <ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !/^(#{1,4}\s|```|>|[-*+]\s|\d+\.\s|---+$)/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inline(paragraph.join(' '))}</p>);
  }

  return <div className={`markdown-content ${className}`.trim()}>{blocks}</div>;
}

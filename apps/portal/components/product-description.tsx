// SPDX-License-Identifier: Apache-2.0
import { Fragment, type ReactNode } from 'react';
// Render the supported Markdown blocks as React elements. Raw HTML is always text;
// links cannot introduce script or data URLs, and no client JavaScript is needed.
function inline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\))/g)
    .map((part, i) => {
      if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
      if (link) {
        const href = link[2]!;
        if (/^(https?:\/\/|mailto:|\/[^/]|#)/i.test(href))
          return (
            <a key={i} href={href}>
              {link[1]}
            </a>
          );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
}
export function ProductDescription({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i]!.startsWith('```'))
        code.push(lines[i]!);
      blocks.push(
        <pre key={i}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
    } else if (/^#{1,6} /.test(line)) {
      // A product has one page heading; description headings start at h2.
      const depth = Math.min(6, Math.max(2, line.indexOf(' ')));
      const Tag = `h${depth}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(<Tag key={i}>{inline(line.replace(/^#+ /, ''))}</Tag>);
    } else if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const pattern = ordered ? /^\d+\. / : /^[-*] /;
      const items: ReactNode[] = [];
      do {
        items.push(<li key={i}>{inline(lines[i]!.replace(pattern, ''))}</li>);
        i++;
      } while (i < lines.length && pattern.test(lines[i]!));
      i--;
      blocks.push(
        ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>,
      );
    } else if (line.startsWith('> '))
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    else {
      const paragraph = [line];
      while (
        i + 1 < lines.length &&
        lines[i + 1]!.trim() &&
        !/^(#{1,6} |```|[-*] |\d+\. |> )/.test(lines[i + 1]!)
      )
        paragraph.push(lines[++i]!);
      blocks.push(<p key={i}>{inline(paragraph.join('\n'))}</p>);
    }
  }
  return <div className="product-description stack">{blocks}</div>;
}

// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function scheme(value: string) {
  return [...value].filter((character) => character.charCodeAt(0) > 32).join('');
}

/** Links keep http, https, mailto and same-portal paths. Images keep absolute https only. */
export function markdownUrlTransform(value: string, key: string): string | undefined {
  const collapsed = scheme(value);
  if (/^(javascript|data|vbscript):/i.test(collapsed)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, 'https://portal.invalid');
  } catch {
    return undefined;
  }
  const image = key === 'src';
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value.trim()) || value.trim().startsWith('//');
  if (image) {
    if (parsed.protocol !== 'https:' || !absolute || parsed.username || parsed.password)
      return undefined;
    return parsed.href;
  }
  if (parsed.protocol === 'mailto:' && collapsed.toLowerCase().startsWith('mailto:'))
    return parsed.href;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (!absolute) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return parsed.href;
}

function plain(children: ReactNode) {
  return <>{children}</>;
}

export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={markdownUrlTransform}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h2>{children}</h2>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel={href.startsWith('http://') || href.startsWith('https://') ? 'noopener noreferrer' : undefined}>
                {children}
              </a>
            ) : (
              plain(children)
            ),
          img: ({ src, alt }) =>
            src ? (
              <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" />
            ) : alt ? (
              plain(alt)
            ) : null,
          pre: ({ children }) => (
            <pre tabIndex={0} role="region" aria-label="Code">
              {children}
            </pre>
          ),
          table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
            <div className="markdown-table" tabIndex={0} role="region" aria-label="Table">
              <table {...props}>{children}</table>
            </div>
          ),
          input: ({ checked }) => (
            <input
              type="checkbox"
              checked={Boolean(checked)}
              disabled
              aria-label={checked ? 'Done' : 'Not done'}
              onChange={() => undefined}
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

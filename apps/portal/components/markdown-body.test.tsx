// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownBody } from './markdown-body';

const payloads = [
  ['raw block script', '<script>alert(1)</script>\n\nSafe paragraph.'],
  ['raw inline html', 'Before <img src=x onerror=alert(1)> after'],
  ['iframe', '<iframe src="https://evil.example"></iframe>\n\nStill here'],
  ['entity-encoded tag', 'Text &lt;script&gt;alert(1)&lt;/script&gt; stays text'],
  ['mixed-case scheme', '[bad](JaVaScRiPt:alert(1))'],
  ['tab-split scheme', '[bad](java\tscript:alert(1))'],
  ['whitespace-split scheme', '[bad](java script:alert(1))'],
  ['reference link', '[bad][ref]\n\n[ref]: javascript:alert(1)'],
  ['autolink', '<javascript:alert(1)>'],
  ['data image', '![secret](data:text/html,no)'],
  ['javascript image', '![secret](javascript:alert(1))'],
] as const;

describe('MarkdownBody', () => {
  it.each(payloads)('drops %s and leaves no script, iframe or unsafe URL', (_name, source) => {
    const { container } = render(<MarkdownBody source={`${source}\n\n[ok](https://example.com)`} />);
    expect(container.querySelector('script, iframe, [onerror]')).toBeNull();
    for (const element of container.querySelectorAll('[href], [src]')) {
      const value = `${element.getAttribute('href') ?? ''} ${element.getAttribute('src') ?? ''}`;
      expect(value).not.toMatch(/javascript:|data:text/i);
    }
    expect(screen.queryByRole('link', { name: /javascript:|data:text/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute('href', 'https://example.com/');
  });

  it('renders the safe remainder: headings, lists, links, images, tables and code', () => {
    const { container } = render(
      <MarkdownBody
        source={[
          '# Heading',
          '',
          '- one',
          '',
          '[site](https://example.com/docs)',
          '',
          '![diagram](https://cdn.example/a.png)',
          '',
          '| A |',
          '| - |',
          '| B |',
          '',
          '```sh',
          'echo ok',
          '```',
          '',
          '[inside](/pages/guide)',
          '',
          '<mailto:ada@example.com>',
        ].join('\n')}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('rel', 'noopener noreferrer');
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://cdn.example/a.png');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('region', { name: 'Code' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('region', { name: 'Table' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('link', { name: 'inside' })).toHaveAttribute('href', '/pages/guide');
    expect(screen.getByRole('link', { name: 'inside' })).not.toHaveAttribute('rel');
    expect(screen.getByRole('link', { name: 'mailto:ada@example.com' })).toHaveAttribute('href', 'mailto:ada@example.com');
  });

  it('supports GFM task lists with accessible disabled checkboxes', () => {
    render(<MarkdownBody source={'- [x] Done\n- [ ] Later'} />);
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Not done' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeDisabled();
  });
});

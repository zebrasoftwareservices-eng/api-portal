// SPDX-License-Identifier: Apache-2.0
'use client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Chevron } from './index';
export function VersionSwitcher({
  versions,
  current,
  changelogHref,
}: {
  versions: {
    version: string;
    isLatest: boolean;
    href: string;
    publishedAt?: string;
  }[];
  current: string;
  changelogHref: string;
}) {
  if (versions.length < 2) return <span className="badge">v{current}</span>;
  const latest = versions.find((v) => v.version === current)?.isLatest;
  return (
    <Menu.Root>
      <Menu.Trigger
        className="button secondary version-trigger"
        aria-label={`Version ${current}${latest ? ', latest' : ''}`}
      >
        Version {current}{' '}
        {latest && <span className="badge latest">Latest</span>}{' '}
        <Chevron variant="menu" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          ref={(node) => {
            if (node)
              requestAnimationFrame(() =>
                node
                  .querySelector<HTMLElement>('[aria-current="page"]')
                  ?.focus(),
              );
          }}
          className="version-menu"
          align="start"
          sideOffset={4}
        >
          {versions.map((v) => (
            <Menu.Item asChild key={v.version} textValue={v.version}>
              <a
                href={v.href}
                aria-current={v.version === current ? 'page' : undefined}
                className="version-item"
              >
                <span aria-hidden="true">
                  {v.version === current ? '✓' : ''}
                </span>
                <span className="mono">{v.version}</span>
                {v.isLatest && <span className="badge latest">Latest</span>}
                {v.publishedAt && (
                  <small className="muted">
                    Published{' '}
                    {new Intl.DateTimeFormat('en-GB', {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }).format(new Date(v.publishedAt))}
                  </small>
                )}
              </a>
            </Menu.Item>
          ))}
          <Menu.Separator className="version-separator" />
          <Menu.Item asChild>
            <a className="version-item" href={changelogHref}>
              View changelog
            </a>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Chevron, Dialog } from '@portal/ui';
import { api } from '../lib/client';
import { assignLocation } from '../lib/navigate';
import { useResource } from './use-resource';

const primary = [
  ['/apis', 'APIs'],
  ['/admin/products', 'Products'],
  ['/admin/apps', 'Apps'],
  ['/admin/requests', 'Requests'],
  ['/admin/insights', 'Insights'],
  ['/admin/tracing', 'Tracing'],
] as const;
const admin = [
  ['/admin/apis', 'APIs'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
  ['/admin/theme', 'Theme'],
  ['/admin/pages', 'Pages'],
  ['/admin/navigation', 'Navigation'],
] as const;

function currentHref(pathname: string) {
  return [...primary, ...admin]
    .filter(([href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([a], [b]) => b.length - a.length)[0]?.[0];
}

function SidebarLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const pending = useResource(() =>
    api.GET('/v1/admin/access-requests', { params: { query: { status: 'pending' } } }),
  );
  useEffect(() => {
    const refresh = () => void pending.reload();
    window.addEventListener('access-requests-changed', refresh);
    return () => window.removeEventListener('access-requests-changed', refresh);
  }, [pending.reload]);
  const count = pending.data?.items.length || 0;
  const current = currentHref(pathname);
  const expanded = admin.some(([href]) => current === href);
  const link = ([href, label]: (typeof primary)[number] | (typeof admin)[number], child = false) => (
    <a
      key={href}
      className={`admin-sidebar-item${child ? ' child' : ''}`}
      href={href}
      aria-current={current === href ? 'page' : undefined}
      aria-label={label === 'Requests' && count ? `Requests, ${count} pending` : undefined}
      onClick={onNavigate}
    >
      <span>{label}</span>
      {label === 'Requests' && count > 0 && (
        <span className="badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
      )}
    </a>
  );
  return (
    <nav className="admin-sidebar-nav" aria-label="Admin">
      {primary.map((item) => link(item))}
      <div className="admin-sidebar-divider" />
      <button
        className="admin-sidebar-item admin-group-button"
        type="button"
        aria-expanded={expanded}
        aria-controls="admin-group"
        onClick={() => assignLocation('/admin/gateways')}
      >
        <span>Admin</span><Chevron />
      </button>
      {expanded && <div id="admin-group">{admin.map((item) => link(item, true))}</div>}
    </nav>
  );
}

export function AdminSidebar({ variant = 'rail' }: { variant?: 'rail' | 'drawer' }) {
  const pathname = usePathname();
  const close = useRef<HTMLButtonElement>(null);
  if (variant === 'rail')
    return <aside className="admin-sidebar built-in-theme"><SidebarLinks pathname={pathname} /></aside>;
  return (
    <div className="admin-drawer">
      <Dialog.Root>
        <Dialog.Trigger asChild><Button variant="ghost">Open menu</Button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="admin-drawer-content built-in-theme" aria-label="Admin menu">
            <Dialog.Title className="sr-only">Admin menu</Dialog.Title>
            <Dialog.Description className="sr-only">Portal administration navigation</Dialog.Description>
            <Dialog.Close asChild><Button ref={close} variant="secondary">Close menu</Button></Dialog.Close>
            <SidebarLinks pathname={pathname} onNavigate={() => close.current?.click()} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

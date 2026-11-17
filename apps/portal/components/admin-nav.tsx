// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect } from 'react';
import { api } from '../lib/client';
import { usePortal } from './providers';
import { useResource } from './use-resource';
import { usePathname } from 'next/navigation';
import { assignLocation } from '../lib/navigate';
const items = [
  ['/admin/apis', 'APIs'],
  ['/admin/products', 'Products'],
  ['/admin/requests', 'Requests'],
  ['/admin/insights', 'Insights'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
  ['/admin/theme', 'Theme'],
] as const;
export function AdminNav() {
  const { user } = usePortal();
  const path = usePathname();
  const hide = path === '/admin/insights' && user?.role !== 'admin';
  const visibleItems = items.filter(
    ([href]) =>
      (href !== '/admin/insights' && href !== '/admin/theme') || user?.role === 'admin',
  );
  const pending = useResource(() =>
    hide
      ? Promise.resolve({ data: { items: [] } })
      : api.GET('/v1/admin/access-requests', {
          params: { query: { status: 'pending' } },
        }),
  );
  useEffect(() => {
    const refresh = () => void pending.reload();
    window.addEventListener('access-requests-changed', refresh);
    return () => window.removeEventListener('access-requests-changed', refresh);
  }, [pending.reload]);
  const count = pending.data?.items.length || 0;
  const current =
    items.find(([href]) => path === href || path.startsWith(`${href}/`))?.[0] ||
    '';
  if (hide) return null;
  return (
    <>
      <nav className="admin-tabs" aria-label="Admin section">
        {visibleItems.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-label={
              label === 'Requests' && count
                ? `Requests, ${count} pending`
                : undefined
            }
            aria-current={current === href ? 'page' : undefined}
          >
            {label}
            {label === 'Requests' && count > 0 && (
              <span className="badge">{count}</span>
            )}
          </a>
        ))}
      </nav>
      <label className="admin-select">
        Admin section
        <select
          value={current}
          onChange={(event) => {
            assignLocation(event.target.value);
          }}
        >
          {visibleItems.map(([href, label]) => (
            <option key={href} value={href}>
              {label}
              {label === 'Requests' && count > 0 && (
                <span className="badge">{count}</span>
              )}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

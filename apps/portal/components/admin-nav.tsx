// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect } from 'react';
import { api } from '../lib/client';
import { useResource } from './use-resource';
import { usePathname, useRouter } from 'next/navigation';
const items = [
  ['/admin/apis', 'APIs'],
  ['/admin/products', 'Products'],
  ['/admin/requests', 'Requests'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
] as const;
export function AdminNav() {
  const pending = useResource(() =>
    api.GET('/v1/admin/access-requests', {
      params: { query: { status: 'pending' } },
    }),
  );
  useEffect(() => {
    const refresh = () => void pending.reload();
    window.addEventListener('access-requests-changed', refresh);
    return () => window.removeEventListener('access-requests-changed', refresh);
  }, [pending.reload]);
  const count = pending.data?.items.length || 0;
  const path = usePathname();
  const router = useRouter();
  const current =
    items.find(([href]) => path === href || path.startsWith(`${href}/`))?.[0] ||
    '';
  return (
    <>
      <nav className="admin-tabs" aria-label="Admin section">
        {items.map(([href, label]) => (
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
          onChange={(event) => router.push(event.target.value)}
        >
          {items.map(([href, label]) => (
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

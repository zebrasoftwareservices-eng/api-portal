// SPDX-License-Identifier: Apache-2.0
'use client';
import { usePathname, useRouter } from 'next/navigation';
const items = [
  ['/admin/apis', 'APIs'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
] as const;
export function AdminNav() {
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
            aria-current={current === href ? 'page' : undefined}
          >
            {label}
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
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

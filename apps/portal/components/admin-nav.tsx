// SPDX-License-Identifier: Apache-2.0
'use client';
import { usePathname } from 'next/navigation';
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav row" aria-label="Admin">
      {[
        ['/admin/apis', 'APIs'],
        ['/admin/gateways', 'Gateways'],
      ].map(([href, label]) => (
        <a
          key={href}
          href={href}
          aria-current={path === href ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

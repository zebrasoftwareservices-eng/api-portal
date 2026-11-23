// SPDX-License-Identifier: Apache-2.0
'use client';
import type { ReactNode } from 'react';
import type { PublicNavigation } from '@portal/sdk';
import { usePathname } from 'next/navigation';
import { visibleFooterItems } from '../lib/portal-nav';
import { usePortal } from './providers';
import { Header } from './header';
import { AdminSidebar } from './admin-sidebar';
import { DemoNotice } from './demo-notice';

export function PortalShell({ children, navigation }: { children: ReactNode; navigation: PublicNavigation }) {
  const { user } = usePortal();
  const pathname = usePathname();
  const admin = user?.role === 'admin';
  const links = visibleFooterItems(navigation, pathname);
  return (
    <>
      <Header navigation={navigation} />
      {admin && <AdminSidebar variant="drawer" />}
      <DemoNotice />
      {admin ? (
        <div className="admin-shell">
          <AdminSidebar />
          <main id="main" className="container admin-content">{children}</main>
        </div>
      ) : (
        <main id="main" className="container">{children}</main>
      )}
      <footer className={links.length ? 'container portal-footer' : 'container'}>
        {links.length > 0 && (
          <nav aria-label="Footer">
            <ul>
              {links.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        Powered by Developer Portal · Apache 2.0
      </footer>
    </>
  );
}

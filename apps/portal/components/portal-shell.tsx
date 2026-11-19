// SPDX-License-Identifier: Apache-2.0
'use client';
import type { ReactNode } from 'react';
import { usePortal } from './providers';
import { Header } from './header';
import { AdminSidebar } from './admin-sidebar';
import { DemoNotice } from './demo-notice';

export function PortalShell({ children }: { children: ReactNode }) {
  const { user } = usePortal();
  const admin = user?.role === 'admin';
  return (
    <>
      <Header />
      {admin && <AdminSidebar variant="drawer" />}
      <DemoNotice />
      {admin ? (
        <div className="admin-shell">
          <AdminSidebar />
          <main id="main" className="container admin-content">{children}</main>
        </div>
      ) : <main id="main" className="container">{children}</main>}
      <footer className="container">Powered by Developer Portal · Apache 2.0</footer>
    </>
  );
}

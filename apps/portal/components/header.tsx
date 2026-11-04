// SPDX-License-Identifier: Apache-2.0
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dialog, toast } from '@portal/ui';
import { auth } from '../lib/client';
import { usePortal } from './providers';
export function Header() {
  const { user } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const links = (
    <>
      <a href="/" aria-current={pathname === '/' ? 'page' : undefined}>
        APIs
      </a>
      {user ? (
        <>
          <a
            href="/dashboard"
            aria-current={
              pathname.startsWith('/dashboard') ? 'page' : undefined
            }
          >
            Dashboard
          </a>
          {user.role === 'admin' && (
            <a
              href="/admin/apis"
              aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            >
              Admin
            </a>
          )}
          <details>
            <summary>{user.email}</summary>
            <Button
              variant="ghost"
              onClick={async () => {
                const { error } = await auth.signOut();
                if (error) {
                  toast.error("We couldn't sign you out. Try again.");
                  return;
                }
                toast.success("You're signed out.");
                router.push('/');
                router.refresh();
              }}
            >
              Sign out
            </Button>
          </details>
        </>
      ) : (
        <>
          <a href="/sign-in">Sign in</a>
          <a href="/sign-up" className="button">
            Sign up
          </a>
        </>
      )}
    </>
  );
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/">
          Developer Portal
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links}
        </nav>
        <div className="mobile-nav">
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button variant="ghost" aria-label="Open menu">
                ☰
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="overlay" />
              <Dialog.Content className="dialog">
                <Dialog.Title>Menu</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Portal navigation
                </Dialog.Description>
                <nav aria-label="Mobile navigation">{links}</nav>
                <Dialog.Close asChild>
                  <Button variant="secondary">Close menu</Button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}

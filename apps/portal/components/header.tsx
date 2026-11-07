// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dialog, toast } from '@portal/ui';
import { isDemo, QUICKSTART_URL } from '../lib/demo';
import { usePortal } from './providers';
export function Header() {
  const { user } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const close = useRef<HTMLButtonElement>(null);
  const links = (
    <>
      <a
        href="/"
        aria-current={
          pathname === '/' || pathname.startsWith('/apis/') ? 'page' : undefined
        }
      >
        APIs
      </a>
      {isDemo() ? (
        <a href={QUICKSTART_URL} className="button">
          Run the quickstart
        </a>
      ) : user ? (
        <>
          <a
            href="/dashboard"
            aria-current={
              pathname.startsWith('/dashboard') ? 'page' : undefined
            }
          >
            My apps
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
                const { auth } = await import('../lib/client');
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
              <Dialog.Content
                className="dialog"
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  close.current?.focus();
                }}
              >
                <Dialog.Title>Menu</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Portal navigation
                </Dialog.Description>
                <Dialog.Close asChild>
                  <Button ref={close} variant="secondary">
                    Close menu
                  </Button>
                </Dialog.Close>
                <nav aria-label="Mobile navigation">{links}</nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}

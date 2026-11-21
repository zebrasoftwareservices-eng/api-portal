// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Chevron, Dialog, DropdownMenu, toast } from '@portal/ui';
import { isDemo, QUICKSTART_URL } from '../lib/demo';
import { HeaderSearch } from './header-search';
import { usePortal } from './providers';
import { usePreviewLogo, usePublicTheme } from './theme-provider';
export function Header() {
  const { user, sessionState } = usePortal();
  const theme = usePublicTheme();
  const previewLogo = usePreviewLogo();
  const pathname = usePathname();
  const router = useRouter();
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');
  const logo = admin ? null : previewLogo !== undefined ? previewLogo : theme.logoUrl;
  const close = useRef<HTMLButtonElement>(null);
  if (pathname === '/setup')
    return (
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/">
            {logo ? <img className="brand-logo" src={logo} alt="Developer Portal" /> : 'Developer Portal'}
          </a>
        </div>
      </header>
    );
  async function signOut() {
    try {
      const { auth } = await import('../lib/client');
      const { error } = await auth.signOut();
      if (error) throw error;
      toast.success("You're signed out.");
      router.push('/');
      router.refresh();
    } catch {
      toast.error("We couldn't sign you out. Try again.");
    }
  }
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'light' : 'dark');
  }
  const links = (mobile = false) => (
    <>
      <a
        href="/"
        aria-current={
          pathname === '/' ||
          pathname.startsWith('/apis/') ||
          pathname.startsWith('/products/')
            ? 'page'
            : undefined
        }
      >
        APIs
      </a>
      {isDemo() ? (
        <>
          {!mobile && <HeaderSearch variant="inline" />}
          <a href={QUICKSTART_URL} className="button">
            Run the quickstart
          </a>
        </>
      ) : user ? (
        <>
          {user.role !== 'admin' && <a
            href="/dashboard"
            aria-current={pathname.startsWith('/dashboard') ? 'page' : undefined}
          >My apps</a>}
          {user.role === 'admin' && !admin && (
            <a
              href="/admin/apis"
              aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            >
              Admin
            </a>
          )}
          {!mobile && <HeaderSearch variant="inline" />}
          {mobile ? (
            <div className="stack">
              <span className="muted">{user.email}</span>
              <a href="/profile">Profile</a>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  aria-label={`Account menu for ${user.email}`}
                >
                  <span className="account-email">{user.email}</span> <Chevron variant="menu" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="account-menu" align="end">
                  <DropdownMenu.Label className="muted">
                    {user.email}
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item asChild>
                    <a href="/profile">Profile</a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={signOut}>
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </>
      ) : sessionState === 'unknown' ? null : (
        <>
          {!mobile && <HeaderSearch variant="inline" />}
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
          {logo ? <img className="brand-logo" src={logo} alt="Developer Portal" /> : 'Developer Portal'}
        </a>
        {user?.role === 'admin' ? (
          <nav className="desktop-nav admin-topbar" aria-label="Admin account">
            <HeaderSearch variant="inline" />
            <Button variant="ghost" aria-label="Toggle theme" onClick={toggleTheme}>◐</Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" aria-label={`Account menu for ${user.email}`}>
                  <span className="account-email">{user.email}</span> <Chevron variant="menu" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="account-menu" align="end">
                  <DropdownMenu.Label className="muted">{user.email}</DropdownMenu.Label>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item asChild><a href="/profile">Profile</a></DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={signOut}>Sign out</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </nav>
        ) : <nav className="desktop-nav" aria-label="Main navigation">{links()}</nav>}
        <HeaderSearch variant="icon" />
        {user?.role !== 'admin' && <div className="mobile-nav">
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
                <nav aria-label="Mobile navigation">{links(true)}</nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>}
      </div>
    </header>
  );
}

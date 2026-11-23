// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
import { usePathname } from 'next/navigation';
import { isDemo } from '../lib/demo';
import { signInLink } from '../lib/navigation';
import { usePortal } from './providers';

export function MissingPage() {
  const pathname = usePathname();
  const { sessionState } = usePortal();
  const showSignIn = !isDemo() && sessionState === 'signed-out';
  return (
    <section className="stack">
      <h1>Page not found</h1>
      <p>We can&apos;t find that page. Check the address, or go back to the APIs.</p>
      {showSignIn && <p>Some pages are for signed-in developers only.</p>}
      <div className="row">
        {showSignIn && (
          <Button asChild>
            <a href={signInLink(pathname)}>Sign in</a>
          </Button>
        )}
        <Button asChild variant={showSignIn ? 'secondary' : 'default'}>
          <a href="/">Go to APIs</a>
        </Button>
      </div>
    </section>
  );
}

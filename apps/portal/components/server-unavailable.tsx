// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@portal/ui';
export function ServerUnavailable({
  reset,
  showHomeLink = true,
}: {
  reset?: () => void;
  showHomeLink?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  // On recovery React removes this screen; restore focus to the new page heading.
  useEffect(
    () => () => {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('main h1')?.focus(),
      );
    },
    [],
  );
  return (
    <section className="server-unavailable stack">
      <span className="warning-text" aria-hidden="true">
        ⚠
      </span>
      <h1 ref={heading} tabIndex={-1}>
        We can&apos;t reach the portal server
      </h1>
      <p>
        This page needs the portal server, and it isn&apos;t responding.
        It&apos;s usually back within a minute. Your apps and keys are safe.
      </p>
      <div className="row">
        <Button
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            setAttempted(true);
            startTransition(() => {
              router.refresh();
              reset?.();
            });
          }}
        >
          {pending ? 'Trying again…' : 'Try again'}
        </Button>
        {showHomeLink && pathname !== '/' && (
          <Button asChild variant="link">
            <a href="/">Go to APIs</a>
          </Button>
        )}
      </div>
      <p role="status">
        {attempted && !pending
          ? "Still can't reach the portal server. Try again in a moment."
          : ''}
      </p>
    </section>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
import { ServerUnavailable } from './server-unavailable';

export function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (error.digest === 'PORTAL_SERVER_UNAVAILABLE') return <ServerUnavailable reset={reset} />;
  return (
    <section className="stack">
      <h1>This page couldn&apos;t be shown</h1>
      <p>Something in its text stopped it from loading. Try again, or go back to the APIs.</p>
      <div className="row">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="secondary">
          <a href="/">Go to APIs</a>
        </Button>
      </div>
    </section>
  );
}

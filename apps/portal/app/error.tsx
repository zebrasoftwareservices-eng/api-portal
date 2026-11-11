// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
import { ServerUnavailable } from '../components/server-unavailable';
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (error.digest === 'PORTAL_SERVER_UNAVAILABLE')
    return <ServerUnavailable reset={reset} />;
  return (
    <div className="stack">
      <h1>Something went wrong</h1>
      <p>The page didn&apos;t load. This is usually temporary.</p>
      <div className="row">
        <Button onClick={reset}>Try again</Button>
        <a href="/">Go to APIs</a>
      </div>
    </div>
  );
}

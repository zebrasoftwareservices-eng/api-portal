// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
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

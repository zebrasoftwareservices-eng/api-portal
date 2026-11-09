// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="stack">
      <h1>API versions</h1>
      <div role="alert" className="alert error">
        We couldn&apos;t load this API. Try again in a moment.{' '}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}

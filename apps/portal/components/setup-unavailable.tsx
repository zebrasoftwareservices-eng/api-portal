// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@portal/ui';
export function SetupUnavailable() {
  const router = useRouter();
  return (
    <div className="alert error stack" role="alert">
      <h1>The portal server isn't ready.</h1>
      <p>It may still be starting. Try again in a moment.</p>
      <Button onClick={() => router.refresh()}>Try again</Button>
    </div>
  );
}

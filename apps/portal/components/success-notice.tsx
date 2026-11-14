// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@portal/ui';
export function SuccessNotice({ message }: { message?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  return message && !dismissed ? (
    <div className="alert" role="status" tabIndex={-1} ref={ref}>
      {message}{' '}
      <Button variant="ghost" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
  ) : null;
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@portal/ui';
import type { Problem } from '../lib/types';
export function ProblemAlert({
  problem,
  title,
  message,
  onRetry,
  retryAfterSeconds = 0,
  autoFocus = true,
}: {
  problem: Problem;
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryAfterSeconds?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [remaining, setRemaining] = useState(retryAfterSeconds);
  useEffect(() => {
    setRemaining(retryAfterSeconds);
    if (autoFocus) ref.current?.focus();
  }, [problem, retryAfterSeconds, autoFocus]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const code = problem.type.split('/').pop() || '';
  const rawTitle =
    problem.title === code || problem.title === code.replaceAll('-', ' ');
  const friendlyTitles: Record<string, string> = {
    validation: 'Check the highlighted fields and try again',
    'gateway-unavailable': 'Gateway unavailable',
    'gateway-rejected': 'The gateway rejected the request',
  };
  const heading =
    title ||
    (rawTitle ? friendlyTitles[code] || 'Something went wrong' : problem.title);
  return (
    <div className="alert error stack" role="alert" tabIndex={-1} ref={ref}>
      <strong>⚠ {heading}</strong>
      <div>
        {message ||
          problem.detail ||
          'Try again, and if the problem continues, tell the portal admin.'}
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="secondary"
          disabled={remaining > 0}
          onClick={onRetry}
        >
          {remaining > 0 ? `Try again in ${remaining}s` : 'Try again'}
        </Button>
      )}
    </div>
  );
}

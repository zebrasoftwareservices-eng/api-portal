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
  titles = {},
}: {
  problem: Problem;
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryAfterSeconds?: number;
  autoFocus?: boolean;
  titles?: Record<string, string>;
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
  const friendlyTitles: Record<string, string> = {
    validation: 'Check the form',
    'smtp-unreachable': "Can't reach the mail server",
    'smtp-auth-failed': 'The mail server rejected the sign-in',
    'smtp-rejected': 'The mail server refused the message',
    'last-admin': "You're the only admin",
    'gateway-service-has-acl': 'Another ACL plugin applies to this service',
    'gateway-service-already-linked':
      'This service already has a published API',
    'gateway-unavailable': 'Gateway unavailable',
    'gateway-rejected': 'Gateway error',
    'invalid-openapi': "This isn't a valid OpenAPI document",
    'unsupported-openapi-version': 'Unsupported OpenAPI version',
    network: "Can't reach the portal server",
  };
  const heading =
    title ||
    titles[code] ||
    (problem.status === 502 ? 'Gateway error' : friendlyTitles[code]) ||
    'Import failed';
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

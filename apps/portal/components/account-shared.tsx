// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, PasswordInput } from '@portal/ui';
import { usePortal } from './providers';
import { auth, retrySeconds } from '../lib/client';
import type { User } from '../lib/types';
export const emailValid = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function passwordError(value: string) {
  return !value
    ? 'Enter a new password.'
    : value.length < 8
      ? 'Use at least 8 characters.'
      : value.length > 128
        ? 'Use 128 characters or fewer.'
        : '';
}
export function waitTime(seconds: number) {
  return seconds < 60
    ? `${Math.max(1, Math.ceil(seconds))} seconds`
    : `${Math.ceil(seconds / 60)} minutes`;
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    element.current?.focus();
  }, []);
  return (
    <div
      className={`alert ${error ? 'error' : 'success'}`}
      role={error ? 'alert' : 'status'}
      tabIndex={-1}
      ref={element}
    >
      {children}
    </div>
  );
}
export function ResultPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="auth stack">
      <h1
        tabIndex={-1}
        ref={(el) => {
          el?.focus();
        }}
      >
        {title}
      </h1>
      {children}
    </Card>
  );
}
export function ResendVerification({
  email,
  label = 'Send verification email',
}: {
  email: string;
  label?: string;
}) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(
      () => setRemaining((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [remaining]);
  return (
    <div className="stack">
      {sent ? (
        <p role="status">Sent. Check {email}. The link works for 24 hours.</p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={pending || remaining > 0}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setPending(true);
            setError('');
            try {
              let seconds = 60;
              const result = await auth.sendVerificationEmail(
                { email, callbackURL: '/profile?verified=1' },
                {
                  onResponse: (ctx) => {
                    seconds = retrySeconds(ctx.response) || 60;
                  },
                },
              );
              if (result.error?.status === 429) {
                setRemaining(seconds);
                setError(
                  `You've asked for several emails in a short time. Try again in ${waitTime(seconds)}.`,
                );
              } else if (result.error)
                setError("We couldn't send the email. Try again.");
              else setSent(true);
            } catch {
              setError("We couldn't send the email. Try again.");
            } finally {
              lock.current = false;
              setPending(false);
            }
          }}
        >
          {pending
            ? 'Sending…'
            : remaining
              ? `Try again in ${waitTime(remaining)}`
              : label}
        </Button>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function VerificationBanner({ user }: { user: User | null }) {
  if (!user?.verificationRequired || user.emailVerified) return null;
  return (
    <div id="verification-banner" className="alert warning stack" tabIndex={-1}>
      <strong>⚠ Verify your email address to create apps and keys</strong>
      <p>We sent a link to {user.email}. Keys you already have keep working.</p>
      <ResendVerification email={user.email} />
      <a href="/profile">Wrong address? Change it in your profile.</a>
    </div>
  );
}
export function AdminNav({
  current,
}: {
  current: 'apis' | 'mail' | 'accounts';
}) {
  const router = useRouter();
  const items = [
    ['apis', 'APIs', '/admin/apis'],
    ['mail', 'Mail', '/admin/settings/mail'],
    ['accounts', 'Accounts', '/admin/settings/accounts'],
  ] as const;
  return (
    <>
      <nav className="admin-tabs" aria-label="Admin section">
        {items.map(([key, label, url]) => (
          <a
            key={key}
            href={url}
            aria-current={key === current ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <label className="admin-select">
        Admin section
        <select
          value={current}
          onChange={(e) => {
            const item = items.find((i) => i[0] === e.target.value);
            if (item) router.push(item[2]);
          }}
        >
          {items.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
export function SecretReplacementField({
  hasSecret,
  onChange,
}: {
  hasSecret: boolean;
  onChange: (value: string | null | undefined) => void;
}) {
  const [mode, setMode] = useState<'keep' | 'replace' | 'remove'>('keep');
  return (
    <div className="stack">
      {hasSecret && mode === 'keep' ? (
        <>
          <p>A password is saved.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode('replace')}
          >
            Replace password
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMode('remove');
              onChange(null);
            }}
          >
            Remove password
          </Button>
        </>
      ) : mode === 'remove' ? (
        <>
          <p>The saved password will be removed when you save.</p>
          <Button
            type="button"
            onClick={() => {
              setMode('keep');
              onChange(undefined);
            }}
          >
            Undo
          </Button>
        </>
      ) : (
        <>
          <label htmlFor="smtp-password">Password (optional)</label>
          <PasswordInput
            id="smtp-password"
            autoComplete="new-password"
            maxLength={1024}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="hint">
            Stored encrypted. It's never shown again after you save.
          </p>
          {hasSecret && (
            <Button
              type="button"
              onClick={() => {
                setMode('keep');
                onChange(undefined);
              }}
            >
              Keep saved password
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function DashboardVerification() {
  const { user } = usePortal();
  return <VerificationBanner user={user} />;
}

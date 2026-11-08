// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PasswordInput } from '@portal/ui';
import { toast } from '@portal/ui';
import { waitTime } from './account-shared';
import { auth, retrySeconds } from '../lib/client';
import { safeNext, signInLink, signUpLink } from '../lib/navigation';
import { Field, focusInvalid } from './field';
export function AuthForm({
  mode,
  next,
  reset,
}: {
  mode: 'sign-up' | 'sign-in';
  next?: string;
  reset?: boolean;
}) {
  const signup = mode === 'sign-up';
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  // The server-rendered form must not accept a native submission before
  // React attaches onSubmit (or lose values entered before hydration).
  useEffect(() => setReady(true), []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  function validate(n = name, e = email, p = password) {
    const result: Record<string, string> = {};
    if (signup && !n.trim()) result.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      result.email = 'Enter an email address, like name@example.com.';
    if (!p)
      result.password = signup
        ? 'Use at least 8 characters.'
        : 'Enter your password.';
    else if (signup && p.length < 8)
      result.password = 'Use at least 8 characters.';
    else if (signup && p.length > 128)
      result.password = 'Use 128 characters or fewer.';
    return result;
  }
  const link = signup ? signInLink(next) : signUpLink(next);
  return (
    <Card className="auth stack">
      {reset && (
        <div role="status" className="alert success">
          Your password is changed. Sign in with your new password.
        </div>
      )}
      {next?.includes('error=invalid_token') && (
        <p>
          That verification link has expired or was already used. Sign in to
          send a new one.
        </p>
      )}
      <h1>{signup ? 'Create your developer account' : 'Sign in'}</h1>
      {signup ? (
        <p>
          {next?.startsWith('/dashboard/apps/new')
            ? 'Sign up to get your API key.'
            : 'Get an API key in under a minute.'}
        </p>
      ) : (
        next && <p>Sign in to continue.</p>
      )}
      {failure && (
        <div
          role="alert"
          className="alert error"
          tabIndex={-1}
          ref={(el) => {
            el?.focus();
          }}
        >
          {failure}
        </div>
      )}
      <form
        ref={form}
        noValidate
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          const invalid = validate();
          setErrors(invalid);
          if (Object.keys(invalid).length) {
            focusInvalid(e.currentTarget);
            return;
          }
          lock.current = true;
          setPending(true);
          setFailure('');
          setDuplicate(false);
          try {
            let seconds = 60;
            const result = signup
              ? await auth.signUp.email({ name: name.trim(), email, password })
              : await auth.signIn.email(
                  { email, password },
                  {
                    onResponse: (ctx) => {
                      seconds = retrySeconds(ctx.response) || 60;
                    },
                  },
                );
            if (result.error) {
              const code = result.error.code || '';
              if (code.includes('USER_ALREADY_EXISTS')) {
                setDuplicate(true);
                setErrors({
                  email: 'An account with this email already exists.',
                });
                focusInvalid(form.current!);
              } else if (result.error.status === 429) {
                setFailure(
                  `Too many sign-in attempts for this address. Try again in ${waitTime(seconds)}.`,
                );
                setPassword('');
              } else if (!signup && result.error.status === 401) {
                setFailure('Email or password is incorrect.');
                setPassword('');
                setTimeout(
                  () =>
                    form.current
                      ?.querySelector<HTMLInputElement>('[name=password]')
                      ?.focus(),
                  0,
                );
              } else
                setFailure(
                  signup
                    ? "We couldn't create your account. Try again."
                    : "We couldn't sign you in. Try again.",
                );
            } else {
              if (signup)
                toast.success(
                  `Check ${email} for a link to verify your address.`,
                );
              router.replace(safeNext(next));
              router.refresh();
            }
          } catch {
            setFailure(
              "Can't reach the portal server. Check your connection and try again.",
            );
          } finally {
            lock.current = false;
            setPending(false);
          }
        }}
      >
        <fieldset disabled={!ready} className="stack">
          {signup && (
            <Field label="Name" error={errors.name}>
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  required
                  readOnly={pending}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors(validate(e.target.value));
                  }}
                />
              )}
            </Field>
          )}
          <Field label="Email" error={errors.email}>
            {(props) => (
              <Input
                {...props}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                readOnly={pending}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors(validate(name, e.target.value));
                }}
              />
            )}
          </Field>
          {duplicate && <a href={link}>Sign in instead</a>}
          <Field
            label="Password"
            error={errors.password}
            hint={signup ? 'At least 8 characters.' : undefined}
          >
            {(props) => (
              <>
                <PasswordInput
                  {...props}
                  name="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  readOnly={pending}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password)
                      setErrors(validate(name, email, e.target.value));
                  }}
                />
              </>
            )}
          </Field>
          {!signup && (
            <a
              href={`/forgot-password${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `?email=${encodeURIComponent(email)}` : ''}`}
            >
              Forgot password?
            </a>
          )}
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending
              ? signup
                ? 'Creating account…'
                : 'Signing in…'
              : signup
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </fieldset>
      </form>
      <p>
        {signup ? 'Already have an account?' : 'New here?'}{' '}
        <a href={link}>{signup ? 'Sign in' : 'Create an account'}</a>
      </p>
    </Card>
  );
}

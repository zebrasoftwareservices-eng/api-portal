// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PasswordInput } from '@portal/ui';
import { auth, quietApi } from '../lib/client';
import { Field, focusInvalid } from './field';
import {
  emailValid,
  Notice,
  passwordError,
  ResultPanel,
} from './account-shared';
export function ForgotPassword({
  initialEmail = '',
}: {
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState('');
  const lock = useRef(false);
  if (sent)
    return (
      <ResultPanel title="Check your email">
        <p>
          If an account uses {email}, we've sent it a link to reset the
          password. The link works for 1 hour.
        </p>
        <p>No email? Check spam, or wait a few minutes and try again.</p>
        <a className="button" href="/sign-in">
          Back to sign in
        </a>
        <Button
          variant="link"
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
        >
          Use a different email
        </Button>
      </ResultPanel>
    );
  return (
    <Card className="auth stack">
      <h1>Reset your password</h1>
      <p>
        Enter the email you sign in with and we'll send you a link to choose a
        new password.
      </p>
      {failure && <Notice error>{failure}</Notice>}
      <form
        noValidate
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          if (!emailValid(email)) {
            setError('Enter an email address, like name@example.com.');
            focusInvalid(e.currentTarget);
            return;
          }
          lock.current = true;
          setPending(true);
          setFailure('');
          try {
            const result = await auth.requestPasswordReset({
              email,
              redirectTo: '/reset-password',
            });
            if (!result.error || result.error.status === 429) setSent(true);
            else setFailure("We couldn't send the link. Try again.");
          } catch {
            setFailure("We couldn't send the link. Try again.");
          } finally {
            lock.current = false;
            setPending(false);
          }
        }}
      >
        <Field label="Email" error={error}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={email}
              readOnly={pending}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
            />
          )}
        </Field>
        <Button disabled={pending}>
          {pending ? 'Sending link…' : 'Send reset link'}
        </Button>
      </form>
      <a href="/sign-in">Back to sign in</a>
    </Card>
  );
}
function useLinkToken(initialToken?: string) {
  const [token] = useState(initialToken);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search,
    );
  }, []);
  return token;
}
export function ResetPassword({
  initialToken,
  invalid,
}: {
  initialToken?: string;
  invalid?: boolean;
}) {
  const token = useLinkToken(initialToken);
  const router = useRouter();
  const [expired, setExpired] = useState(invalid || !token);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  if (expired)
    return (
      <ResultPanel title="This link has expired">
        <p>
          Reset links work once, for 1 hour. Your password hasn't changed. Send
          yourself a new link to try again.
        </p>
        <a className="button" href="/forgot-password">
          Send a new link
        </a>
        <a href="/sign-in">Back to sign in</a>
      </ResultPanel>
    );
  return (
    <Card className="auth stack">
      <h1>Choose a new password</h1>
      {failure && <Notice error>{failure}</Notice>}
      <form
        className="stack"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          const err = passwordError(password);
          setError(err);
          if (err) {
            focusInvalid(e.currentTarget);
            return;
          }
          lock.current = true;
          setPending(true);
          try {
            const result = await auth.resetPassword({
              newPassword: password,
              token: token!,
            });
            if (result.error?.code === 'INVALID_TOKEN') setExpired(true);
            else if (result.error)
              setFailure("We couldn't change your password. Try again.");
            else {
              router.replace('/sign-in?reset=1');
              router.refresh();
            }
          } catch {
            setFailure("We couldn't change your password. Try again.");
          } finally {
            lock.current = false;
            setPending(false);
          }
        }}
      >
        <Field label="New password" error={error} hint="At least 8 characters.">
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={password}
              readOnly={pending}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button disabled={pending}>
          {pending ? 'Changing password…' : 'Change password'}
        </Button>
      </form>
      <p>You'll be signed out on your other devices.</p>
    </Card>
  );
}
export function ConfirmEmail({ initialToken }: { initialToken?: string }) {
  const token = useLinkToken(initialToken);
  const [state, setState] = useState(!token ? 'expired' : 'confirm');
  const [email, setEmail] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  if (state === 'expired')
    return (
      <ResultPanel title="This link has expired">
        <p>
          Email change links work once, for 24 hours, and a newer request
          replaces them. Your email hasn't changed. Go to your profile to send a
          new link.
        </p>
        <a className="button" href="/profile">
          Go to profile
        </a>
      </ResultPanel>
    );
  if (state === 'unavailable')
    return (
      <ResultPanel title="This address can't be used">
        <p>
          Your email hasn't changed. Go to your profile to choose another
          address.
        </p>
        <a className="button" href="/profile">
          Go to profile
        </a>
      </ResultPanel>
    );
  if (state === 'success')
    return (
      <ResultPanel title="Email changed">
        <p>Your email is now {email}. Use it the next time you sign in.</p>
        <a className="button" href={signedIn ? '/profile' : '/sign-in'}>
          {signedIn ? 'Go to profile' : 'Sign in'}
        </a>
      </ResultPanel>
    );
  return (
    <Card className="auth stack">
      <h1>Confirm your new email</h1>
      <p>Select the button to make this the address you sign in with.</p>
      {failure && <Notice error>{failure}</Notice>}
      <Button
        disabled={pending}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setPending(true);
          try {
            const { data, error } = await quietApi.POST(
              '/v1/me/email/confirm',
              { body: { token: token! } },
            );
            if (error?.status === 400) setState('expired');
            else if (error?.status === 409) setState('unavailable');
            else if (data) {
              setEmail(data.email);
              const session = await quietApi
                .GET('/v1/me')
                .catch(() => ({ data: undefined }));
              setSignedIn(!!session.data);
              setState('success');
            } else setFailure("We couldn't confirm your email. Try again.");
          } catch {
            setFailure("We couldn't confirm your email. Try again.");
          } finally {
            lock.current = false;
            setPending(false);
          }
        }}
      >
        {pending ? 'Confirming…' : 'Confirm new email'}
      </Button>
    </Card>
  );
}

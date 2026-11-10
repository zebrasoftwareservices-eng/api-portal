// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@portal/ui';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Problem } from '../lib/types';
import { Field, focusInvalid } from './field';
import { ProblemAlert } from './problem-alert';
export function SetupForm({
  setupTokenRequired,
}: {
  setupTokenRequired: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!pending && Object.keys(errors).length && form.current)
      focusInvalid(form.current);
  }, [pending, errors]);
  async function submit() {
    if (lock.current) return;
    const invalid: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      invalid.email = 'Enter an email address, like name@example.com.';
    if (password.length < 8) invalid.password = 'Use at least 8 characters.';
    if (password.length > 128)
      invalid.password = 'Use 128 characters or fewer.';
    if (setupTokenRequired && !token.trim())
      invalid.setupToken = 'Enter the setup token from the server’s logs.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const result = await api.POST('/v1/setup/admin', {
        body: {
          email: email.trim(),
          password,
          ...(setupTokenRequired ? { setupToken: token.trim() } : {}),
        },
      });
      if (result.error) {
        setProblem(result.error);
        setRetry(retrySeconds(result.response));
        if (result.error.type.endsWith('/setup-token-invalid'))
          setErrors({
            setupToken:
              "That token didn't match. Copy it again from the server's logs. It changes each time the server starts.",
          });
        else if (result.error.errors)
          setErrors(
            Object.fromEntries(
              result.error.errors.map((e) => [
                e.pointer?.slice(1) || '',
                e.message,
              ]),
            ),
          );
      } else {
        setPassword('');
        setToken('');
        const { data } = await api
          .GET('/v1/me')
          .catch(() => ({ data: undefined }));
        if (!data) router.replace('/sign-in');
        else {
          const gateways = await api.GET('/v1/admin/gateways');
          router.replace(
            gateways.data?.items.length ? '/admin/apis' : '/setup/gateway',
          );
        }
        router.refresh();
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const complete = problem?.type.endsWith('/setup-complete');
  return (
    <Card className="auth stack">
      <h1>Set up your portal</h1>
      <p>
        Create the first admin account. It runs this portal, and it can only be
        created once.
      </p>
      {problem && (
        <ProblemAlert
          problem={problem}
          onRetry={complete ? undefined : submit}
          retryAfterSeconds={retry}
        />
      )}
      {complete ? (
        <a href="/sign-in">Sign in</a>
      ) : (
        <form
          ref={form}
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="stack" disabled={!ready || pending}>
            {setupTokenRequired && (
              <Field
                label="Setup token"
                error={errors.setupToken}
                hint={
                  'Find it in the portal server\'s logs, on the line starting "Setup token". It changes each time the server starts.'
                }
              >
                {(props) => (
                  <Input
                    {...props}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field label="Email" error={errors.email}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Password"
              error={errors.password}
              hint="At least 8 characters."
            >
              {(props) => (
                <div className="row">
                  <Input
                    {...props}
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={show}
                    onClick={() => setShow(!show)}
                  >
                    {show ? 'Hide' : 'Show'}
                  </Button>
                </div>
              )}
            </Field>
            <Button type="submit" aria-busy={pending}>
              {pending ? 'Creating admin…' : 'Create admin account'}
            </Button>
          </fieldset>
        </form>
      )}
    </Card>
  );
}

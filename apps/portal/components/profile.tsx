// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  Button,
  Card,
  Input,
  PageHeader,
  PasswordInput,
  toast,
} from '@portal/ui';
import { api, auth, networkProblem, retrySeconds } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { usePortal } from './providers';
import { Field, focusInvalid } from './field';
import {
  Notice,
  emailValid,
  passwordError,
  ResendVerification,
  waitTime,
} from './account-shared';
import { ProblemAlert } from './problem-alert';
export function Profile({
  verified,
  invalid,
}: {
  verified?: boolean;
  invalid?: boolean;
}) {
  const router = useRouter();
  const { setUser, setReveal } = usePortal();
  const resource = useResource(() => api.GET('/v1/me'));
  const apps = useResource(() => api.GET('/v1/apps'));
  const user = resource.data;
  const [name, setName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [deletion, setDeletion] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState('');
  const lock = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const pendingEmailNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (user?.pendingEmail) pendingEmailNotice.current?.focus();
  }, [user?.pendingEmail]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, Problem | undefined>>(
    {},
  );
  const [success, setSuccess] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (user) setName(user.name);
  }, [user?.name]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('verified');
    url.searchParams.delete('error');
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search,
    );
  }, []);
  function problem(section: string, error: Problem) {
    setProblems((p) => ({ ...p, [section]: error }));
  }
  async function run(section: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(section);
    setProblems((p) => ({ ...p, [section]: undefined }));
    try {
      await action();
    } catch {
      problem(section, networkProblem());
    } finally {
      lock.current = false;
      setPending('');
    }
  }
  function update(value: NonNullable<typeof user>) {
    resource.setData(value);
    setUser(value);
    router.refresh();
  }
  async function changeEmail(value: string) {
    await run('email', async () => {
      const { data, error, response } = await api.POST('/v1/me/email', {
        body: { newEmail: value },
      });
      if (error) {
        if (error.status === 409)
          setErrors((p) => ({
            ...p,
            email: "This address can't be used. Choose another one.",
          }));
        else
          problem(
            'email',
            error.status === 429
              ? {
                  ...error,
                  detail: `You've asked for several emails in a short time. Try again in ${waitTime(retrySeconds(response))}.`,
                }
              : error,
          );
      } else if (data) {
        update(data);
        setEditing(false);
        setNewEmail('');
        toast.success(`Confirmation link sent to ${value}.`);
      }
    });
  }
  async function deleteAccount() {
    if (!deletion) {
      setErrors((p) => ({ ...p, deletion: 'Enter your password.' }));
      return;
    }
    await run('delete', async () => {
      const { error, response } = await api.DELETE('/v1/me', {
        body: { password: deletion },
      });
      if (error) {
        setRetry(retrySeconds(response));
        if (error.type.endsWith('/invalid-password')) {
          setErrors((p) => ({
            ...p,
            deletion:
              'This password is incorrect. Your account was not deleted.',
          }));
          setDeletion('');
          requestAnimationFrame(() =>
            document.getElementById('delete-password')?.focus(),
          );
        } else
          problem(
            'delete',
            error.status === 502
              ? {
                  ...error,
                  detail:
                    'Your account was not deleted. Some of your apps may already be removed. Try again, and if it keeps happening, tell the portal admin.',
                }
              : error.status === 429
                ? {
                    ...error,
                    detail: `Too many incorrect passwords. Try again in ${waitTime(retrySeconds(response))}. Your account was not deleted.`,
                  }
                : error,
          );
      } else {
        setOpen(false);
        setUser(null);
        setReveal(null);
        toast.success('Your account is deleted.');
        router.replace('/');
        router.refresh();
      }
    });
  }
  if (resource.loading)
    return (
      <div className="stack form">
        <PageHeader
          title="Profile"
          description="Your name, sign-in email and password."
        />
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="skeleton" aria-label="Loading profile" />
        ))}
      </div>
    );
  if (resource.error)
    return <ProblemAlert problem={resource.error} onRetry={resource.reload} />;
  if (!user)
    return <a href="/sign-in?next=%2Fprofile">Sign in to view your profile</a>;
  return (
    <div className="stack form">
      <PageHeader
        title="Profile"
        description="Your name, sign-in email and password."
      />
      {invalid ? (
        <Notice error={!user.emailVerified}>
          {user.emailVerified ? (
            'Your email address is already verified.'
          ) : (
            <>
              That verification link has expired or was already used.
              <ResendVerification email={user.email} label="Send a new link" />
            </>
          )}
        </Notice>
      ) : (
        verified && <Notice>Your email address is verified.</Notice>
      )}
      <Card className="stack">
        <h2>Name</h2>
        {problems.name && (
          <ProblemAlert
            problem={problems.name}
            message="We couldn't save your name. Try again."
          />
        )}
        <form
          className="stack"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const error = !name.trim()
              ? 'Enter your name.'
              : name.trim().length > 100
                ? 'Use 100 characters or fewer.'
                : '';
            setErrors((p) => ({ ...p, name: error }));
            if (error) {
              focusInvalid(e.currentTarget);
              return;
            }
            if (name.trim() === user.name) {
              toast.success('Name saved.');
              return;
            }
            await run('name', async () => {
              const { data, error } = await api.PATCH('/v1/me', {
                body: { name: name.trim() },
              });
              if (error) problem('name', error);
              else if (data) {
                update(data);
                toast.success('Name saved.');
              }
            });
          }}
        >
          <Field label="Name" error={errors.name}>
            {(props) => (
              <Input
                {...props}
                autoComplete="name"
                value={name}
                readOnly={!!pending}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Button disabled={!!pending}>
            {pending === 'name' ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      </Card>
      <Card className="stack">
        <h2>Email</h2>
        <p className="wrap-anywhere">
          {user.email}{' '}
          <span
            className={`badge ${user.emailVerified ? 'active' : 'warning'}`}
          >
            {user.emailVerified ? '✓ Verified' : '⚠ Not verified'}
          </span>
        </p>
        {!user.emailVerified && (
          <div className="alert warning stack">
            <p>
              Verify your email address. We sent a link to {user.email} when you
              signed up.
              {user.verificationRequired &&
                ' Creating apps and keys needs a verified address.'}
            </p>
            <ResendVerification email={user.email} />
          </div>
        )}
        {user.pendingEmail && (
          <div
            className="alert stack"
            role="status"
            tabIndex={-1}
            ref={pendingEmailNotice}
          >
            Waiting for you to confirm {user.pendingEmail}. We sent it a link
            that works for 24 hours. Until then, sign in with {user.email}.
            <Button
              disabled={!!pending}
              variant="secondary"
              onClick={() => changeEmail(user.pendingEmail!)}
            >
              Send the link again
            </Button>
          </div>
        )}
        {problems.email && <ProblemAlert problem={problems.email} />}
        {editing ? (
          <form
            className="stack"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (!emailValid(newEmail)) {
                setErrors((p) => ({
                  ...p,
                  email: 'Enter an email address, like name@example.com.',
                }));
                focusInvalid(e.currentTarget);
                return;
              }
              setErrors((p) => ({ ...p, email: '' }));
              await changeEmail(newEmail);
            }}
          >
            <Field
              label="New email"
              error={errors.email}
              hint={`We'll send a confirmation link to this address. Until you open it, you sign in with ${user.email}.${user.pendingEmail ? ` This replaces the link we sent to ${user.pendingEmail}.` : ''}`}
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  readOnly={!!pending}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              )}
            </Field>
            <Button disabled={!!pending}>
              {pending === 'email' ? 'Sending link…' : 'Send confirmation link'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!!pending}
              onClick={() => {
                setEditing(false);
                requestAnimationFrame(() =>
                  document.getElementById('change-email')?.focus(),
                );
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            id="change-email"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Change email
          </Button>
        )}
      </Card>
      <Card className="stack">
        <h2>Password</h2>
        <p>Changing your password signs you out on your other devices.</p>
        {problems.password && <ProblemAlert problem={problems.password} />}
        {success && <Notice>{success}</Notice>}
        <form
          className="stack"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const invalid = {
              current: current ? '' : 'Enter your current password.',
              password: passwordError(password),
            };
            setErrors((p) => ({ ...p, ...invalid }));
            if (invalid.current || invalid.password) {
              focusInvalid(e.currentTarget);
              return;
            }
            setSuccess('');
            await run('password', async () => {
              let seconds = 60;
              const result = await auth.changePassword(
                {
                  currentPassword: current,
                  newPassword: password,
                  revokeOtherSessions: true,
                },
                {
                  onResponse: (ctx) => {
                    seconds = retrySeconds(ctx.response) || 60;
                  },
                },
              );
              if (result.error?.code === 'INVALID_PASSWORD') {
                setErrors((p) => ({
                  ...p,
                  current:
                    'This password is incorrect. Your password is unchanged.',
                }));
                setCurrent('');
                requestAnimationFrame(() =>
                  document.getElementById('current-password')?.focus(),
                );
              } else if (result.error)
                problem('password', {
                  type: '/problems/password-change',
                  title: 'Password unchanged',
                  status: result.error.status || 400,
                  detail:
                    result.error.status === 429
                      ? `Too many incorrect passwords. Try again in ${waitTime(seconds)}. Your password is unchanged.`
                      : "We couldn't change your password. Try again. Your password is unchanged.",
                });
              else {
                setCurrent('');
                setPassword('');
                setSuccess(
                  "Password changed. You've been signed out everywhere else.",
                );
              }
            });
          }}
        >
          <Field
            label="Current password"
            id="current-password"
            error={errors.current}
          >
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={current}
                readOnly={!!pending}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="New password"
            error={errors.password}
            hint="At least 8 characters."
          >
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={password}
                readOnly={!!pending}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button disabled={!!pending}>
            {pending === 'password' ? 'Changing password…' : 'Change password'}
          </Button>
        </form>
      </Card>
      <Card className="stack delete-account">
        <h2>Delete account</h2>
        <p>Deletes your account, apps and API keys. This can't be undone.</p>
        <AlertDialog.Root
          open={open}
          onOpenChange={(value) => {
            if (pending === 'delete') return;
            setOpen(value);
            if (!value) {
              setDeletion('');
              setErrors((p) => ({ ...p, deletion: '' }));
              void apps.reload();
            }
          }}
        >
          <AlertDialog.Trigger asChild>
            <Button variant="destructive">Delete account…</Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="overlay" />
            <AlertDialog.Content
              className="dialog stack"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                cancel.current?.focus();
              }}
              onEscapeKeyDown={(e) => {
                if (pending === 'delete') e.preventDefault();
              }}
            >
              <AlertDialog.Title>Delete your account?</AlertDialog.Title>
              <AlertDialog.Description asChild>
                <div>
                  <p>This deletes:</p>
                  <ul>
                    <li>your account, {user.email}</li>
                    {apps.data?.items.length !== 0 && (
                      <li>
                        {apps.data
                          ? `your ${apps.data.items.length} apps and all their API keys`
                          : 'all your apps and their API keys'}
                      </li>
                    )}
                  </ul>
                  <p>
                    Keys stop working in the gateway straight away. This can't
                    be undone.
                  </p>
                </div>
              </AlertDialog.Description>
              <Field
                label="Password"
                id="delete-password"
                error={errors.deletion}
                hint="Enter your password to confirm."
              >
                {(props) => (
                  <PasswordInput
                    {...props}
                    autoComplete="current-password"
                    value={deletion}
                    readOnly={pending === 'delete'}
                    onChange={(e) => setDeletion(e.target.value)}
                  />
                )}
              </Field>
              {problems.delete && (
                <ProblemAlert
                  problem={problems.delete}
                  retryAfterSeconds={retry}
                  onRetry={
                    problems.delete.status === 503 ? deleteAccount : undefined
                  }
                />
              )}
              <div className="row actions">
                <AlertDialog.Cancel asChild>
                  <Button
                    ref={cancel}
                    variant="secondary"
                    disabled={pending === 'delete'}
                  >
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  variant="destructive"
                  disabled={pending === 'delete'}
                  onClick={deleteAccount}
                >
                  {pending === 'delete'
                    ? 'Deleting account…'
                    : 'Delete account'}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </Card>
    </div>
  );
}

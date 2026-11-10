// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, toast } from '@portal/ui';
import { auth, networkProblem, quietApi } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { roleHelp, roleName } from './team-context';
import { DateValue } from './date';
export function Invitation({ token }: { token: string }) {
  const router = useRouter();
  const preview = useResource(async () =>
    token
      ? quietApi.POST('/v1/invitations/preview', { body: { token } })
      : {
          error: {
            type: '/problems/not-found',
            title: 'Not found',
            status: 404,
          },
        },
  );
  const session = useResource(() => quietApi.GET('/v1/me'));
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [wrongAccount, setWrongAccount] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const invite = preview.data;
  useEffect(() => {
    if (invite) heading.current?.focus();
  }, [invite?.state, invite?.teamName]);
  const next = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const authLink = (mode: string) =>
    `/${mode}?email=${encodeURIComponent(invite?.email || '')}&next=${encodeURIComponent(next)}`;
  const user = session.data;
  const wrong =
    wrongAccount ||
    (user &&
      user.email.trim().toLowerCase() !== invite?.email.trim().toLowerCase());
  if (preview.loading || session.loading)
    return (
      <Card className="auth stack" role="status">
        Loading invitation…
      </Card>
    );
  if (preview.error?.status === 404 || !token)
    return (
      <Card className="auth stack">
        <h1>This invitation link doesn't work</h1>
        <p>
          The link may be incomplete. Open it again from the email, or ask the
          person who invited you to send a new one.
        </p>
        <a className="button" href="/">
          Go to the portal
        </a>
      </Card>
    );
  if (preview.error || !invite)
    return (
      <Card className="auth stack">
        <ProblemAlert
          problem={preview.error || networkProblem()}
          message="We couldn't load this invitation."
          onRetry={preview.reload}
        />
      </Card>
    );
  if (session.error && session.error.status !== 401)
    return (
      <Card className="auth stack">
        <ProblemAlert
          problem={session.error}
          message="We couldn't check your account."
          onRetry={session.reload}
        />
      </Card>
    );
  const state = invite.state;
  if (state !== 'pending') {
    const copy = {
      cancelled: [
        'This invitation was cancelled',
        `An Admin of ${invite.teamName} cancelled it. Ask them for a new invitation.`,
      ],
      expired: [
        'This invitation has expired',
        `Invitations work for 7 days. Ask an Admin of ${invite.teamName} to invite you again.`,
      ],
      accepted: [
        'This invitation has already been used',
        `If you accepted it, ${invite.teamName} is in your team list. Otherwise, ask an Admin of ${invite.teamName} for a new invitation.`,
      ],
    }[state];
    return (
      <Card className="auth stack">
        <h1 ref={heading} tabIndex={-1}>
          {copy[0]}
        </h1>
        <p>{copy[1]}</p>
        <a className="button" href={user ? '/dashboard' : authLink('sign-in')}>
          {user ? 'Go to My apps' : 'Sign in'}
        </a>
      </Card>
    );
  }
  return (
    <Card className="auth stack">
      <h1 ref={heading} tabIndex={-1}>
        Join {invite.teamName}
      </h1>
      <p>
        {invite.invitedByName
          ? `${invite.invitedByName} invited you`
          : "You're invited"}{' '}
        to {invite.teamName} as{' '}
        {invite.role === 'admin'
          ? 'an Admin'
          : invite.role === 'member'
            ? 'a Member'
            : 'a Read-only member'}
        .
      </p>
      <dl className="card stack">
        <dt>Invited address</dt>
        <dd className="wrap-anywhere">{invite.email}</dd>
        <dt>Role</dt>
        <dd>
          {roleName(invite.role)} — {roleHelp[invite.role]}
        </dd>
        <dt>Expires</dt>
        <dd>
          <DateValue value={invite.expiresAt} />
        </dd>
      </dl>
      {problem && (
        <ProblemAlert
          problem={problem}
          message={`We couldn't accept the invitation. You haven't joined ${invite.teamName}. Try again.`}
        />
      )}
      {!user ? (
        <>
          <p>To accept, sign in or create an account with {invite.email}.</p>
          <a className="button" href={authLink('sign-up')}>
            Create an account
          </a>
          <a className="button secondary" href={authLink('sign-in')}>
            Sign in
          </a>
        </>
      ) : wrong ? (
        <>
          <div className="alert warning" role="alert">
            This invitation is for {invite.email}. You're signed in as{' '}
            {user.email}.
          </div>
          <Button
            disabled={pending}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setPending(true);
              try {
                const result = await auth.signOut();
                if (result.error) setProblem(networkProblem());
                else {
                  router.replace(authLink('sign-in'));
                  router.refresh();
                }
              } catch {
                setProblem(networkProblem());
              } finally {
                lock.current = false;
                setPending(false);
              }
            }}
          >
            Sign out and use another account
          </Button>
          <a href="/dashboard">Go to My apps</a>
        </>
      ) : (
        <>
          <Button
            disabled={pending}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setPending(true);
              setProblem(undefined);
              try {
                const result = await quietApi.POST('/v1/invitations/accept', {
                  body: { token },
                });
                if (result.error) {
                  const type = result.error.type;
                  if (result.error.status === 401)
                    router.replace(authLink('sign-in'));
                  else if (type.endsWith('/invitation-wrong-account')) {
                    setWrongAccount(true);
                    await session.reload();
                  } else if (
                    ['cancelled', 'expired', 'used'].some((s) =>
                      type.endsWith(`/invitation-${s}`),
                    )
                  ) {
                    preview.setData({
                      ...invite,
                      state: type.endsWith('-used')
                        ? 'accepted'
                        : type.endsWith('-expired')
                          ? 'expired'
                          : 'cancelled',
                    });
                  } else setProblem(result.error);
                } else {
                  toast.success(
                    `You joined ${invite.teamName} as ${roleName(invite.role)}.`,
                  );
                  router.replace('/dashboard');
                  router.refresh();
                }
              } catch {
                setProblem(networkProblem());
              } finally {
                lock.current = false;
                setPending(false);
              }
            }}
          >
            {pending ? 'Joining…' : 'Accept invitation'}
          </Button>
          <a href="/dashboard">Not now</a>
        </>
      )}
    </Card>
  );
}

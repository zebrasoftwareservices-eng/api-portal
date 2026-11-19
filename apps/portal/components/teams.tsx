// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  DropdownMenu as Menu,
  Button,
  Card,
  Input,
  PageHeader,
  SelectField,
  toast,
} from '@portal/ui';
import type { components } from '@portal/sdk';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Problem } from '../lib/types';
import { usePortal } from './providers';
import { useResource } from './use-resource';
import { Field, focusInvalid } from './field';
import { ProblemAlert } from './problem-alert';
import { DateValue } from './date';
import { RoleBadge, roleHelp, roleName, type Role } from './team-context';
import { waitTime } from './account-shared';
type Member = components['schemas']['TeamMember'];
const roles: Role[] = ['admin', 'member', 'read-only'];
export function CreateTeam() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  return (
    <div className="stack form">
      <PageHeader
        title="Create a team"
        description="Teams share apps and keys. Apps you create in a team keep working when people leave."
        breadcrumb={[
          { label: 'My apps', href: '/dashboard' },
          { label: 'New team' },
        ]}
      />
      {problem && (
        <ProblemAlert
          problem={problem}
          message="We couldn't create the team. Nothing was created. Try again."
        />
      )}
      <form
        className="stack"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          const form = e.currentTarget;
          const invalid = !name.trim()
            ? 'Enter a team name.'
            : name.trim().length > 80
              ? 'Use 80 characters or fewer.'
              : '';
          setError(invalid);
          if (invalid) {
            focusInvalid(form);
            return;
          }
          lock.current = true;
          setPending(true);
          setProblem(undefined);
          try {
            const result = await api.POST('/v1/teams', {
              body: { name: name.trim() },
            });
            if (result.error) {
              if (result.error.status === 400) {
                setError(
                  result.error.errors?.[0]?.message || 'Enter a team name.',
                );
                focusInvalid(form);
              } else setProblem(result.error);
            } else if (result.data) {
              toast.success(
                `${result.data.name} is created. You're its Admin.`,
              );
              router.push(`/dashboard/teams/${result.data.id}`);
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
        <Field
          label="Team name"
          hint="For example, Payments or Mobile app."
          error={error}
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              autoComplete="off"
              autoFocus
              value={name}
              readOnly={pending}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="row actions">
          <a href="/dashboard">Cancel</a>
          <Button disabled={pending}>
            {pending ? 'Creating team…' : 'Create team'}
          </Button>
        </div>
      </form>
    </div>
  );
}
export function TeamPage({ teamId }: { teamId: string }) {
  const resource = useResource(() =>
    api.GET('/v1/teams/{teamId}', { params: { path: { teamId } } }),
  );
  const team = resource.data;
  const router = useRouter();
  const { user } = usePortal();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [fieldError, setFieldError] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [dialogProblem, setDialogProblem] = useState<Problem>();
  const [pending, setPending] = useState('');
  const lock = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const dialogContent = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [action, setAction] = useState<{
    kind: 'role' | 'remove' | 'leave';
    member: Member;
  }>();
  const [newRole, setNewRole] = useState<Role>('member');
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const admin = team?.role === 'admin';
  useEffect(() => {
    if (team) {
      document.title = `${team.name} · Developer Portal`;
      heading.current?.focus();
    }
  }, [team?.id, team?.name]);
  async function run(key: string, fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(key);
    try {
      await fn();
    } catch {
      (action ? setDialogProblem : setProblem)(networkProblem());
    } finally {
      lock.current = false;
      setPending('');
    }
  }
  function open(kind: 'role' | 'remove' | 'leave', member: Member) {
    actionTrigger.current =
      kind === 'leave'
        ? document.getElementById('leave-team')
        : document.getElementById(`member-${member.userId}`);
    setAction({ kind, member });
    setNewRole(member.role);
    setDialogProblem(undefined);
    setNeedsAdmin(
      (kind === 'leave' || kind === 'role') &&
        member.role === 'admin' &&
        team?.members.filter((m) => m.role === 'admin').length === 1,
    );
  }
  async function mutationError(error: Problem, dialog = false) {
    (dialog ? setDialogProblem : setProblem)(error);
    if (error.status === 403 || error.status === 404) {
      setAction(undefined);
      await resource.reload();
      router.refresh();
    }
  }
  if (resource.loading && !team)
    return (
      <div role="status" className="skeleton">
        Loading team…
      </div>
    );
  if (resource.error?.status === 404)
    return (
      <>
        <h1>We can't find this team</h1>
        <p>It may not exist, or you may no longer be a member.</p>
        <a href="/dashboard">Back to My apps</a>
      </>
    );
  if (resource.error || !team)
    return (
      <ProblemAlert
        problem={resource.error || networkProblem()}
        message="We couldn't load this team."
        onRetry={resource.reload}
      />
    );
  const onlyAdmin =
    action?.member.role === 'admin' &&
    team.members.filter((m) => m.role === 'admin').length === 1;
  const self = team.members.find((m) => m.userId === user?.id);
  return (
    <div className="stack">
      <nav aria-label="Breadcrumb">
        <a href="/dashboard">My apps</a> / {team.name}
      </nav>
      <h1 ref={heading} tabIndex={-1}>
        {team.name}
      </h1>
      <div>
        <span className="sr-only">Your role: </span>
        <RoleBadge role={team.role} />
      </div>
      {team.personal ? (
        <Card>
          <h2>This is your personal team</h2>
          <p>
            Only you can use it, and its apps are deleted with your account. To
            share apps with colleagues, create a team.
          </p>
          <a className="button" href="/dashboard/teams/new">
            Create team
          </a>
        </Card>
      ) : (
        <>
          <p>
            {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
          </p>
          {problem && <ProblemAlert problem={problem} />}
          {admin && (
            <Card className="stack">
              <h2>Invite people</h2>
              <form
                className="stack"
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const value = email.trim().toLowerCase();
                  const invalid = !value
                    ? 'Enter an email address.'
                    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                      ? 'Enter an email address like name@example.com.'
                      : '';
                  setFieldError(invalid);
                  if (invalid) {
                    focusInvalid(form);
                    return;
                  }
                  await run('invite', async () => {
                    setProblem(undefined);
                    const result = await api.POST(
                      '/v1/teams/{teamId}/invitations',
                      {
                        params: { path: { teamId } },
                        body: { email: value, role },
                      },
                    );
                    if (result.error) {
                      const type = result.error.type;
                      if (
                        type.endsWith('/already-member') ||
                        type.endsWith('/invitation-pending')
                      ) {
                        setFieldError(
                          type.endsWith('/already-member')
                            ? `${value} is already in this team.`
                            : `${value} already has a pending invitation. Cancel it below to send a new one.`,
                        );
                        focusInvalid(form);
                      } else
                        await mutationError({
                          ...result.error,
                          detail: type.endsWith('/mail-not-configured')
                            ? 'No invitation was sent. Ask the portal admin to set up mail.'
                            : result.error.status === 429
                              ? `You've sent too many invitations in the last hour. Try again in ${waitTime(retrySeconds(result.response))}. No invitation was sent.`
                              : result.error.status === 403
                                ? 'Only team Admins can invite people. Your role may have changed. No invitation was sent.'
                                : result.error.detail,
                        });
                    } else {
                      toast.success(`Invitation sent to ${value}.`);
                      setEmail('');
                      await resource.reload();
                      emailInput.current?.focus();
                    }
                  });
                }}
              >
                <Field label="Email" error={fieldError}>
                  {(props) => (
                    <Input
                      {...props}
                      ref={emailInput}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      spellCheck={false}
                      readOnly={!!pending}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </Field>
                <label htmlFor="invite-role">Role</label>
                <SelectField
                  id="invite-role"
                  aria-describedby="invite-role-help"
                  value={role}
                  disabled={!!pending}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                    </option>
                  ))}
                </SelectField>
                <p id="invite-role-help" className="hint">
                  {roleHelp[role]}
                </p>
                <Button disabled={!!pending}>
                  {pending === 'invite' ? 'Sending…' : 'Send invitation'}
                </Button>
                <p className="hint">
                  They get an email with a link that works for 7 days.
                </p>
              </form>
            </Card>
          )}
          <section className="stack">
            <h2 id="members-heading" tabIndex={-1}>
              Members
            </h2>
            {!admin && (
              <p className="muted">
                Only team Admins can invite people or change roles.
              </p>
            )}
            <table className="team-table">
              <caption className="sr-only">Members of {team.name}</caption>
              <thead>
                <tr>
                  {[
                    'Name',
                    'Email',
                    'Role',
                    'Joined',
                    ...(admin ? ['Actions'] : []),
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.members.map((member) => (
                  <tr key={member.userId}>
                    <td>
                      <h3 title={member.name}>
                        {member.name}
                        {member.userId === user?.id && ' (you)'}
                      </h3>
                    </td>
                    <td>
                      <p title={member.email} className="wrap-anywhere">
                        {member.email}
                      </p>
                    </td>
                    <td>
                      <span>
                        <RoleBadge role={member.role} />
                      </span>
                    </td>
                    <td>
                      <DateValue value={member.joinedAt} />
                    </td>
                    {admin && (
                      <td>
                        <Menu.Root>
                          <Menu.Trigger
                            className="button ghost"
                            id={`member-${member.userId}`}
                            aria-label={`Actions for ${member.name}`}
                          >
                            ⋯
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Content className="version-menu">
                              <Menu.Item
                                className="version-item"
                                onSelect={() => open('role', member)}
                              >
                                Change role…
                              </Menu.Item>
                              <Menu.Item
                                className="version-item"
                                onSelect={() =>
                                  open(
                                    member.userId === user?.id
                                      ? 'leave'
                                      : 'remove',
                                    member,
                                  )
                                }
                              >
                                {member.userId === user?.id
                                  ? 'Leave team…'
                                  : 'Remove from team…'}
                              </Menu.Item>
                            </Menu.Content>
                          </Menu.Portal>
                        </Menu.Root>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {team.memberCount === 1 && (
              <p className="muted">
                Invite colleagues above. They'll see this team's apps once they
                accept.
              </p>
            )}
          </section>
          {admin && team.invitations !== null && (
            <section className="stack">
              <h2 id="invitations-heading" tabIndex={-1}>
                Pending invitations
              </h2>
              {!team.invitations.length ? (
                <p>No pending invitations.</p>
              ) : (
                <table className="team-table">
                  <caption className="sr-only">
                    Pending invitations to {team.name}
                  </caption>
                  <thead>
                    <tr>
                      {[
                        'Email',
                        'Role',
                        'Invited by',
                        'Expires',
                        'Actions',
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {team.invitations.map((invite) => (
                      <tr key={invite.id}>
                        <td>
                          <h3 className="wrap-anywhere">{invite.email}</h3>
                        </td>
                        <td>
                          <RoleBadge role={invite.role} />
                        </td>
                        <td>{invite.invitedBy?.name || 'A deleted account'}</td>
                        <td>
                          <DateValue value={invite.expiresAt} />
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            aria-label={`Cancel invitation to ${invite.email}`}
                            disabled={!!pending}
                            onClick={() =>
                              void run(invite.id, async () => {
                                setProblem(undefined);
                                const result = await api.DELETE(
                                  '/v1/teams/{teamId}/invitations/{invitationId}',
                                  {
                                    params: {
                                      path: { teamId, invitationId: invite.id },
                                    },
                                  },
                                );
                                if (result.error) {
                                  if (
                                    result.error.type.endsWith(
                                      '/invitation-used',
                                    )
                                  ) {
                                    toast.error(
                                      `${invite.email} already accepted this invitation.`,
                                    );
                                    await resource.reload();
                                  } else if (
                                    result.error.status === 403 ||
                                    result.error.status === 404
                                  )
                                    await mutationError(result.error);
                                  else
                                    toast.error(
                                      "We couldn't cancel the invitation. Try again.",
                                    );
                                } else {
                                  toast.success(
                                    `Invitation to ${invite.email} cancelled.`,
                                  );
                                  await resource.reload();
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById('invitations-heading')
                                      ?.focus(),
                                  );
                                }
                              })
                            }
                          >
                            {pending === invite.id
                              ? 'Cancelling…'
                              : 'Cancel invitation'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {self && (
            <section className="stack">
              <h2>Leave team</h2>
              <p>
                You lose access to {team.name}'s apps. Keys you created keep
                working.
              </p>
              <Button
                id="leave-team"
                variant="destructive"
                onClick={() => open('leave', self)}
              >
                Leave team…
              </Button>
            </section>
          )}
        </>
      )}
      <AlertDialog.Root
        open={!!action}
        onOpenChange={(value) => {
          if (!value && !pending) setAction(undefined);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            ref={dialogContent}
            className="dialog stack"
            onOpenAutoFocus={(e) => {
              if (action?.kind === 'role' && !needsAdmin) {
                e.preventDefault();
                dialogContent.current
                  ?.querySelector<HTMLElement>('input:checked')
                  ?.focus();
              }
            }}
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (actionTrigger.current?.isConnected)
                actionTrigger.current.focus();
              else document.getElementById('members-heading')?.focus();
            }}
          >
            <AlertDialog.Title>
              {needsAdmin && action?.kind === 'leave'
                ? `${team.name} needs another Admin`
                : action?.kind === 'role'
                  ? action.member.userId === user?.id
                    ? 'Change your role'
                    : `Change ${action.member.name}'s role`
                  : action?.kind === 'remove'
                    ? `Remove ${action.member.name} from ${team.name}?`
                    : `Leave ${team.name}?`}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {needsAdmin && action?.kind === 'role'
                ? `You're the only Admin of ${team.name}. Make another member an Admin before you change your own role.`
                : needsAdmin
                  ? team.memberCount === 1
                    ? `You're the only member of ${team.name}. Invite someone and make them an Admin, then leave.`
                    : "You're the only Admin, so you can't leave yet. Make another member an Admin first, then leave."
                  : action?.kind === 'role'
                    ? 'Their access changes on their next page load. Existing keys keep working.'
                    : action?.kind === 'remove'
                      ? `They lose access to ${team.name}'s apps and keys straight away. Keys they created keep working. You can invite them again later.`
                      : 'You lose access to its apps straight away. Keys you created keep working. To come back, an Admin has to invite you.'}
            </AlertDialog.Description>
            {action?.kind === 'role' && (
              <fieldset disabled={!!pending || needsAdmin} className="stack">
                <legend>Role</legend>
                {roles.map((r) => (
                  <label key={r}>
                    <input
                      type="radio"
                      name="new-role"
                      checked={newRole === r}
                      onChange={() => setNewRole(r)}
                    />{' '}
                    {roleName(r)}
                    <span className="hint"> {roleHelp[r]}</span>
                  </label>
                ))}
                {onlyAdmin && newRole !== 'admin' && (
                  <p role="alert">
                    {team.name} needs at least one Admin. Make another member an
                    Admin first. Nothing changed.
                  </p>
                )}
              </fieldset>
            )}
            {dialogProblem && <ProblemAlert problem={dialogProblem} />}
            <div className="row actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={!!pending}>
                  {needsAdmin ? 'Close' : 'Cancel'}
                </Button>
              </AlertDialog.Cancel>
              {!needsAdmin && (
                <Button
                  variant={action?.kind === 'role' ? 'default' : 'destructive'}
                  disabled={
                    !!pending ||
                    (action?.kind === 'role' &&
                      !!onlyAdmin &&
                      newRole !== 'admin')
                  }
                  onClick={() =>
                    void run('member', async () => {
                      if (!action) return;
                      setDialogProblem(undefined);
                      if (
                        action.kind === 'role' &&
                        newRole === action.member.role
                      ) {
                        setAction(undefined);
                        return;
                      }
                      const path = { teamId, userId: action.member.userId };
                      const result =
                        action.kind === 'role'
                          ? await api.PATCH(
                              '/v1/teams/{teamId}/members/{userId}',
                              { params: { path }, body: { role: newRole } },
                            )
                          : await api.DELETE(
                              '/v1/teams/{teamId}/members/{userId}',
                              { params: { path } },
                            );
                      if (result.error) {
                        if (
                          action.kind === 'leave' &&
                          result.error.type.endsWith('/team-needs-admin')
                        )
                          setNeedsAdmin(true);
                        else if (
                          action.kind === 'leave' &&
                          result.error.status === 404
                        ) {
                          router.push('/dashboard');
                          router.refresh();
                        } else await mutationError(result.error, true);
                      } else {
                        toast.success(
                          action.kind === 'role'
                            ? `${action.member.name} is now ${roleName(newRole)}.`
                            : action.kind === 'leave'
                              ? `You left ${team.name}.`
                              : `${action.member.name} was removed from ${team.name}.`,
                        );
                        const leaving = action.kind === 'leave';
                        setAction(undefined);
                        if (leaving) router.push('/dashboard');
                        else await resource.reload();
                        router.refresh();
                      }
                    })
                  }
                >
                  {pending
                    ? action?.kind === 'role'
                      ? 'Saving…'
                      : action?.kind === 'leave'
                        ? 'Leaving…'
                        : 'Removing…'
                    : action?.kind === 'role'
                      ? 'Save role'
                      : action?.kind === 'leave'
                        ? 'Leave team'
                        : 'Remove member'}
                </Button>
              )}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

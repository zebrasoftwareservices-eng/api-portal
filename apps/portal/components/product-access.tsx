// SPDX-License-Identifier: Apache-2.0
'use client';
import { useState, useRef } from 'react';
import { Button, Card, Input, SelectField, toast } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import {
  AccessDialog,
  AccessStatus,
  Confirmation,
  TeamCombobox,
  teamLabel,
  type AdminTeam,
} from './access-shared';
import type { Product } from './plans';
type Visibility = components['schemas']['ProductVisibility'];
const options: [Visibility, string, string][] = [
  ['open', 'Open', 'Listed for everyone, even signed out.'],
  ['hidden', 'Hidden', 'Listed only for signed-in developers.'],
  [
    'internal',
    'Internal',
    'Listed only for the teams you name. They subscribe themselves.',
  ],
  [
    'manual',
    'Manual',
    "Listed for no one. You set up each team's subscription.",
  ],
];
export function ProductAccess({ product }: { product: Product }) {
  const r = useResource(() =>
    api.GET('/v1/admin/products/{productId}/access', {
      params: { path: { productId: product.id } },
    }),
  );
  const [visibility, setVisibility] = useState<Visibility>();
  const [teams, setTeams] = useState<AdminTeam[]>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [confirmation, setConfirmation] = useState<Problem>();
  const [assign, setAssign] = useState(false);
  const selected = visibility || r.data?.visibility || 'open';
  const named = teams || r.data?.teams || [];
  const changed =
    selected !== r.data?.visibility ||
    named
      .map((t) => t.id)
      .sort()
      .join() !==
      r.data?.teams
        .map((t) => t.id)
        .sort()
        .join();
  async function save(choice?: 'keep' | 'revoke') {
    if (lock.current) return;
    if (selected === 'internal' && !named.length) {
      setProblem({
        type: '/problems/invalid-teams',
        status: 400,
        title: 'Name at least one team, or choose Hidden.',
      });
      return;
    }
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const result = await api.PUT('/v1/admin/products/{productId}/access', {
        params: { path: { productId: product.id } },
        body: {
          visibility: selected,
          ...(selected === 'internal'
            ? { teamIds: named.map((t) => t.id) }
            : {}),
          ...(choice ? { existingSubscriptions: choice } : {}),
        },
      });
      if (result.error) {
        if (result.error.type.endsWith('/confirmation-required'))
          setConfirmation(result.error);
        else setProblem(result.error);
      } else if (result.data) {
        r.setData(result.data);
        setVisibility(undefined);
        setTeams(undefined);
        setConfirmation(undefined);
        toast.success(
          result.data.revocation.revoked
            ? `Access saved. ${result.data.revocation.revoked} subscriptions revoked.`
            : 'Access saved.',
        );
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  const pendingCount =
    r.data?.subscriptions.filter((s) => s.status === 'revoke-pending').length ||
    r.data?.revocation.pending ||
    0;
  return (
    <Card className="stack">
      <h2>Access</h2>
      <p>Who can find this product and how teams get it.</p>
      {r.loading ? (
        <p className="skeleton" role="status">
          Loading access…
        </p>
      ) : r.error ? (
        <ProblemAlert
          problem={r.error}
          message="We couldn't load access."
          onRetry={r.reload}
        />
      ) : (
        <>
          <fieldset disabled={pending} className="stack">
            <legend>Visibility</legend>
            {options.map(([value, label, description]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="visibility"
                  aria-label={label}
                  value={value}
                  checked={selected === value}
                  onChange={() => setVisibility(value)}
                  aria-describedby={`visibility-${value}`}
                />{' '}
                {label}
                <span className="hint" id={`visibility-${value}`}>
                  {description}
                </span>
              </label>
            ))}
          </fieldset>
          {selected === 'internal' && (
            <div className="stack">
              <h3>Teams with access</h3>
              <TeamCombobox multiple value={named} onChange={setTeams} />
            </div>
          )}
          {problem && (
            <ProblemAlert
              problem={problem}
              message={
                problem.status === 400
                  ? problem.title
                  : "We couldn't save access. Try again."
              }
            />
          )}
          <Button disabled={pending || !changed} onClick={() => void save()}>
            {pending ? 'Saving…' : 'Save access'}
          </Button>
          {pendingCount > 0 && (
            <div className="alert warning">
              <p>
                Revoking {pendingCount} subscriptions is still pending.
                We&apos;re retrying automatically — the keys stop working once
                the gateway confirms.
              </p>
              <ul>
                {r.data?.subscriptions
                  .filter((s) => s.status === 'revoke-pending')
                  .map((s) => (
                    <li key={s.appId}>
                      {s.team.name} · {s.name} ·{' '}
                      <AccessStatus status={s.status} />
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {r.data?.visibility === 'manual' && (
            <>
              <h3>Assigned teams</h3>
              <ul>
                {r.data.subscriptions
                  .filter((s) => s.origin === 'admin')
                  .map((s) => (
                    <li key={s.appId}>
                      {s.team.name} · {s.plan.name} · {s.name} ·{' '}
                      <AccessStatus status={s.status} />
                    </li>
                  ))}
              </ul>
              <Button onClick={() => setAssign(true)}>Assign to a team</Button>
            </>
          )}
        </>
      )}
      <Confirmation
        error={problem}
        problem={confirmation}
        pending={pending}
        onCancel={() => {
          setConfirmation(undefined);
          setProblem(undefined);
        }}
        onSave={(choice) => void save(choice)}
      />
      {confirmation && problem && (
        <div role="alert">{problem.detail || problem.title}</div>
      )}
      {assign && (
        <AssignSubscription
          product={product}
          onClose={() => setAssign(false)}
          onSaved={() => void r.reload()}
        />
      )}
    </Card>
  );
}
function AssignSubscription({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [planId, setPlanId] = useState(product.plans[0]?.id || '');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current || !teams[0] || !planId || !name.trim()) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const result = await api.POST('/v1/admin/subscriptions', {
        body: { teamId: teams[0].id, planId, name: name.trim() },
      });
      if (result.error) setProblem(result.error);
      else {
        toast.success(
          `Subscription created. We emailed ${teamLabel(teams[0])}'s Admins and Members.`,
        );
        onSaved();
        onClose();
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <AccessDialog
      title={`Give a team access to ${product.name}`}
      description="The team's Admins and Members get an email and reveal the key themselves. You never see it."
      open
      pending={pending}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={pending} className="stack">
          <legend>Team</legend>
          <TeamCombobox
            value={teams}
            onChange={(value) => {
              setTeams(value);
              if (value[0])
                setName(
                  `${value[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${product.slug}`.slice(
                    0,
                    80,
                  ),
                );
            }}
          />
          <label>
            Plan
            <SelectField value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {product.plans.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label>
            Subscription name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
        </fieldset>
        {problem && (
          <ProblemAlert
            problem={problem}
            message={
              problem.type.endsWith('/app-name-taken')
                ? `${teams[0]?.name} already has a subscription called ${name}. Choose another name.`
                : problem.status === 409 &&
                    problem.type.endsWith('/team-not-named')
                  ? 'Add the team to this product first'
                  : problem.status === 502 || problem.status === 503
                    ? "The gateway is unavailable, so the subscription wasn't created. Try again once it's back."
                    : "We couldn't create the subscription. Try again."
            }
          />
        )}
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            disabled={pending || !teams.length || !planId || !name.trim()}
          >
            {pending ? 'Creating…' : 'Create subscription'}
          </Button>
        </div>
      </form>
    </AccessDialog>
  );
}

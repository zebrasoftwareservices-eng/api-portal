// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Textarea, toast } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { useTeams } from './team-context';
import {
  AccessDialog,
  AccessStatus,
  CountedTextarea,
  type AccessRequest,
} from './access-shared';
import { Field } from './field';
import { useResource } from './use-resource';
import { DateValue } from './date';
import { ProblemAlert } from './problem-alert';
export function requestError(problem: Problem, name: string) {
  if (problem.type.endsWith('/request-pending'))
    return "Your team already has a pending request for this plan. You'll get an email when an admin decides.";
  if (problem.type.endsWith('/app-name-taken'))
    return `Your team already has a subscription called ${name}. Choose another name.`;
  if (problem.type.endsWith('/approval-not-required'))
    return 'This plan no longer needs approval. Close this and choose Subscribe.';
  if (problem.type.endsWith('/admin-assigned-only'))
    return 'Access to this product is set up by your portal admin.';
  if (problem.status === 403)
    return 'Only a team Admin or Member with a verified email can request access.';
  if (problem.status === 404) return 'This plan is no longer available.';
  if (problem.status === 400)
    return 'Tell the admin why your team needs this plan, in 1000 characters or fewer.';
  return "We couldn't send your request. Check your connection and try again.";
}
export function RequestAccess({
  plan,
  productName,
  open,
  onClose,
  onSent,
  initialName = '',
}: {
  plan: { id: string; name: string };
  productName: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  initialName?: string;
}) {
  const { teams, current } = useTeams();
  const eligible = teams.filter((t) => t.role !== 'read-only');
  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState(initialName);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setTeamId(
        eligible.find((t) => t.id === current?.id)?.id || eligible[0]?.id || '',
      );
      setName(initialName);
      setReason('');
      setProblem(undefined);
      setErrors({});
    }
  }, [open, initialName, current?.id]);
  useEffect(() => {
    if (problem || Object.keys(errors).length) alert.current?.focus();
  }, [problem, errors]);
  async function submit() {
    if (lock.current || !eligible.some((t) => t.id === teamId)) return;
    const invalid: Record<string, string> = {};
    if (!name.trim()) invalid.name = 'Give the subscription a name.';
    else if (name.trim().length > 80)
      invalid.name = 'Use 80 characters or fewer.';
    if (!reason.trim())
      invalid.reason = 'Tell the admin why your team needs this plan.';
    else if (reason.trim().length > 1000)
      invalid.reason = 'Keep the reason to 1000 characters or fewer.';
    if (description.length > 500)
      invalid.description = 'Use 500 characters or fewer.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const r = await api.POST('/v1/access-requests', {
        body: {
          planId: plan.id,
          teamId,
          name: name.trim(),
          reason: reason.trim(),
          description,
        },
      });
      if (r.error) {
        setProblem(r.error);
        if (r.error.status === 400)
          setErrors({ reason: requestError(r.error, name) });
        if (r.error.type.endsWith('/app-name-taken'))
          setErrors({ name: requestError(r.error, name) });
      } else {
        toast.success("Request sent. We'll email you when an admin decides.");
        onSent();
        onClose();
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <AccessDialog
      title={`Request access to ${plan.name}`}
      description={`${productName} · An admin reviews every request.`}
      open={open}
      onClose={onClose}
      pending={pending}
    >
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {(problem || Object.keys(errors).length > 0) && (
          <div role="alert" tabIndex={-1} ref={alert} className="alert error">
            {problem
              ? requestError(problem, name)
              : Object.values(errors).join(' ')}
            {problem?.type.endsWith('/request-pending') && (
              <a href="/dashboard#requests">View requests</a>
            )}
          </div>
        )}
        <fieldset className="stack" disabled={pending}>
          {eligible.length > 1 ? (
            <label>
              Team
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {eligible.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              For team <strong>{eligible[0]?.name || 'unavailable'}</strong>
            </p>
          )}
          <Field
            label="Subscription name"
            error={errors.name}
            hint="Letters, numbers and dashes. Shown to your team."
          >
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
          </Field>
          <CountedTextarea
            label="Why does your team need this plan?"
            value={reason}
            onChange={setReason}
            required
            error={errors.reason}
            hint="The admin sees this, along with your name and team."
          />
          <Field label="Description (optional)" error={errors.description}>
            {(props) => (
              <Textarea
                {...props}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
        </fieldset>
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={pending || !teamId}>
            {pending ? 'Sending…' : 'Send request'}
          </Button>
        </div>
      </form>
    </AccessDialog>
  );
}
export function TeamRequests() {
  const { current, unavailable } = useTeams();
  const resource = useResource(() =>
    !current || unavailable
      ? Promise.resolve({ data: { items: [] as AccessRequest[] } })
      : api.GET('/v1/access-requests', {
          params: { query: { teamId: current.id } },
        }),
  );
  const scope = useRef(current?.id);
  useEffect(() => {
    if (scope.current !== current?.id) {
      scope.current = current?.id;
      void resource.reload();
    }
  }, [current?.id, resource.reload]);
  const [again, setAgain] = useState<AccessRequest>();
  const visible = useResource(() => api.GET('/v1/products'));
  if (!resource.loading && !resource.error && !resource.data?.items.length)
    return null;
  return (
    <section id="requests" className="stack">
      <h2>Requests</h2>
      {resource.loading ? (
        <div role="status" className="skeleton">
          Loading requests…
        </div>
      ) : resource.error ? (
        <ProblemAlert
          problem={resource.error}
          message="We couldn't load your team's requests. Try again."
          onRetry={resource.reload}
        />
      ) : (
        resource.data?.items.map((r) => (
          <article key={r.id} className="card stack access-card">
            <div className="row">
              <h3>
                {r.product.name} · {r.plan.name}
              </h3>
              <AccessStatus status={r.status} />
            </div>
            <p>
              {r.kind === 'subscribe' ? 'New' : 'Plan change'} ·{' '}
              <DateValue value={r.submittedAt} />
            </p>
            <details>
              <summary>Show reason</summary>
              <p className="access-note">{r.reason}</p>
            </details>
            {r.decision?.note && (
              <p className="access-note">
                {r.decision.system ? 'Note:' : 'Note from admin:'} &quot;
                {r.decision.note}&quot;
              </p>
            )}
            {r.status === 'approved' && r.app && (
              <a href={`/dashboard/apps/${r.app.id}`}>View subscription</a>
            )}
            {r.status === 'rejected' &&
              current?.role !== 'read-only' &&
              visible.data?.items.some(
                (p) => p.id === r.product.id && p.visibility !== 'manual',
              ) &&
              (r.kind === 'plan-change' && r.app ? (
                <a href={`/dashboard/apps/${r.app.id}#plan`}>Request again</a>
              ) : (
                <Button variant="secondary" onClick={() => setAgain(r)}>
                  Request again
                </Button>
              ))}
          </article>
        ))
      )}
      {again && (
        <RequestAccess
          plan={again.plan}
          productName={again.product.name}
          initialName={again.name}
          open
          onClose={() => setAgain(undefined)}
          onSent={() => void resource.reload()}
        />
      )}
    </section>
  );
}

export function RejectedPlanChange({
  appId,
  teamId,
  readOnly,
  onAgain,
}: {
  appId: string;
  teamId: string;
  readOnly: boolean;
  onAgain: (planId: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const r = useResource(() =>
    api.GET('/v1/access-requests', { params: { query: { teamId } } }),
  );
  const latest = r.data?.items?.find(
    (item) => item.kind === 'plan-change' && item.app?.id === appId,
  );
  if (dismissed || latest?.status !== 'rejected') return null;
  return (
    <div className="alert stack">
      <p>
        Your request to move to {latest.plan.name} was rejected.{' '}
        {latest.decision?.system ? 'Note:' : 'Note from admin:'}{' '}
        <span className="access-note">{latest.decision?.note}</span>
      </p>
      <div className="actions">
        {!readOnly && (
          <Button variant="secondary" onClick={() => onAgain(latest.plan.id)}>
            Request again
          </Button>
        )}
        <Button variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

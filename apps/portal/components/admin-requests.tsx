// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, PageHeader, SelectField, toast } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import {
  AccessDialog,
  AccessStatus,
  CountedTextarea,
  type AccessRequest,
} from './access-shared';
import { useResource } from './use-resource';
import { DateValue } from './date';
import { ProblemAlert } from './problem-alert';
export function AdminRequests() {
  const [filter, setFilter] = useState<
    'pending' | 'approved' | 'rejected' | 'all'
  >('pending');
  const r = useResource(async () => {
    if (filter !== 'all')
      return api.GET('/v1/admin/access-requests', {
        params: { query: { status: filter } },
      });
    const results = await Promise.all(
      (['pending', 'approved', 'rejected'] as const).map((status) =>
        api.GET('/v1/admin/access-requests', { params: { query: { status } } }),
      ),
    );
    const error = results.find((result) => result.error)?.error;
    return error
      ? { error }
      : {
          data: {
            items: results
              .flatMap((result) => result.data?.items || [])
              .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
          },
        };
  });
  const loadedFilter = useRef(filter);
  useEffect(() => {
    if (loadedFilter.current !== filter) {
      loadedFilter.current = filter;
      void r.reload();
    }
  }, [filter, r.reload]);
  const [selected, setSelected] = useState<{
    request: AccessRequest;
    approve: boolean;
  }>();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [validation, setValidation] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const decisionTrigger = useRef<HTMLButtonElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problem || validation) alert.current?.focus();
  }, [problem, validation]);
  async function decide() {
    if (!selected || lock.current) return;
    if (!selected.approve && !note.trim()) {
      setValidation('Add a note so the requester knows why.');
      return;
    }
    if (note.trim().length > 1000) {
      setValidation('Keep the note to 1000 characters or fewer.');
      return;
    }
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    setValidation('');
    try {
      const params = { path: { requestId: selected.request.id } };
      const result = selected.approve
        ? await api.POST('/v1/admin/access-requests/{requestId}/approve', {
            params,
            body: { note: note.trim() },
          })
        : await api.POST('/v1/admin/access-requests/{requestId}/reject', {
            params,
            body: { note: note.trim() },
          });
      if (result.error) setProblem(result.error);
      else {
        toast.success(
          selected.approve
            ? `Approved. ${selected.request.team.name} can now reveal their key.`
            : `Rejected. We emailed ${selected.request.requester?.email || 'the requester'}.`,
        );
        decisionTrigger.current = null;
        setSelected(undefined);
        await r.reload();
        window.dispatchEvent(new Event('access-requests-changed'));
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('#request-queue h2')?.focus(),
        );
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  const message =
    problem &&
    (problem.status === 502 || problem.status === 503
      ? "The gateway is unavailable, so the request wasn't approved. It's still pending — try again once the gateway is back."
      : problem.type.endsWith('/request-decided')
        ? 'Someone already decided this request.'
        : problem.type.endsWith('/app-name-taken')
          ? `${selected?.request.team.name} already has a subscription called ${selected?.request.name}. Ask them to rename it or reject with a note.`
          : problem.status === 400
            ? 'Keep the note to 1000 characters or fewer.'
            : problem.detail || 'We couldn’t decide the request. Try again.');
  return (
    <div className="stack">
      <PageHeader
        title="Access requests"
        description="Oldest first. Approving gives the team a key they reveal in the portal."
      />
      <label>
        Status
        <SelectField
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <option value={s} key={s}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </option>
          ))}
        </SelectField>
      </label>
      <div id="request-queue" className="stack">
        {r.loading ? (
          <div role="status" className="skeleton">
            Loading requests…
          </div>
        ) : r.error ? (
          <ProblemAlert
            problem={r.error}
            message="We couldn't load the requests."
            onRetry={r.reload}
          />
        ) : !r.data?.items.length ? (
          <div className="card">
            <h2 tabIndex={-1}>
              {filter === 'pending' ? 'No pending requests' : 'No requests'}
            </h2>
            <p>When a developer requests a plan, it will appear here.</p>
          </div>
        ) : (
          r.data.items.map((item) => (
            <article className="card stack access-card" key={item.id}>
              <h2 tabIndex={-1}>
                {item.product.name} · {item.plan.name}
              </h2>
              <p>
                {item.kind === 'subscribe'
                  ? 'New subscription'
                  : `Plan change from ${item.fromPlan?.name || 'previous plan'}`}
              </p>
              <p>
                {item.team.name} · requested by{' '}
                {item.requester?.name || 'Deleted account'}{' '}
                {item.requester && `(${item.requester.email})`} ·{' '}
                <DateValue value={item.submittedAt} />
              </p>
              <p className="access-note">{item.reason}</p>
              <p>
                Subscription name: <span className="mono">{item.name}</span>
              </p>
              {item.status === 'pending' ? (
                <div className="actions">
                  {[false, true].map((approve) => (
                    <Button
                      variant={approve ? 'default' : 'secondary'}
                      key={String(approve)}
                      onClick={(e) => {
                        decisionTrigger.current = e.currentTarget;
                        setSelected({ request: item, approve });
                        setNote('');
                        setProblem(undefined);
                        setValidation('');
                      }}
                    >
                      {approve ? 'Approve…' : 'Reject'}
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <AccessStatus status={item.status} />
                  {item.decision && (
                    <p>
                      <DateValue value={item.decision.decidedAt} />
                    </p>
                  )}
                  {item.decision?.note && (
                    <p className="access-note">Note: {item.decision.note}</p>
                  )}
                </>
              )}
            </article>
          ))
        )}
      </div>
      {selected && (
        <AccessDialog
          title={`${selected.approve ? 'Approve' : 'Reject'} ${selected.request.plan.name} for ${selected.request.team.name}?`}
          description={
            selected.approve
              ? 'The team can reveal their key in the portal after approval.'
              : 'The requester gets an email with your note. They can request again.'
          }
          open
          pending={pending}
          returnFocusRef={decisionTrigger}
          onClose={() => setSelected(undefined)}
        >
          <form
            className="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void decide();
            }}
          >
            {(problem || validation) && (
              <div
                ref={alert}
                tabIndex={-1}
                role="alert"
                className="alert error"
              >
                {message || validation}
              </div>
            )}
            <CountedTextarea
              label={
                selected.approve
                  ? 'Note to the requester (included in the email)'
                  : 'Reason for rejecting (included in the email)'
              }
              value={note}
              onChange={setNote}
              required={!selected.approve}
              hint={selected.approve ? 'Optional.' : undefined}
              error={validation}
            />
            <div className="actions">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setSelected(undefined)}
              >
                Cancel
              </Button>
              {problem?.type.endsWith('/request-decided') ? (
                <Button
                  type="button"
                  onClick={() => {
                    decisionTrigger.current = null;
                    setSelected(undefined);
                    void r.reload();
                  }}
                >
                  OK
                </Button>
              ) : (
                <Button
                  disabled={pending}
                  variant={selected.approve ? 'default' : 'destructive'}
                >
                  {pending
                    ? 'Saving…'
                    : selected.approve
                      ? 'Approve request'
                      : 'Reject request'}
                </Button>
              )}
            </div>
          </form>
        </AccessDialog>
      )}
    </div>
  );
}

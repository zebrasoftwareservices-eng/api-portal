// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { useTeams } from './team-context';
import { usePortal } from './providers';
import { useResource } from './use-resource';
import { PlanRadios, PlanTable, type Product } from './plans';
import { Field } from './field';
import { ProblemAlert } from './problem-alert';
import { RequestAccess } from './access-requests';
import { ResendVerification } from './account-shared';
export function ChangeProblem({
  problem,
  unchanged,
  retry,
}: {
  problem: Problem;
  unchanged: string;
  retry?: () => void;
}) {
  const { user } = usePortal();
  const { current } = useTeams();
  const code = problem.type.split('/').pop();
  const paused = /gateway-(disabled|not-connected)$/.test(problem.type);
  return (
    <ProblemAlert
      problem={problem}
      title={
        code === 'credential-revoked'
          ? 'This key is already revoked'
          : code === 'credential-limit'
            ? 'This subscription already has a key'
            : code === 'team-role-forbidden'
              ? `You can't change this in ${current?.name || 'this team'}`
              : problem.status === 503
                ? 'The gateway is unavailable'
                : problem.status === 502
                  ? 'The gateway rejected this change'
                  : paused
                    ? 'Changes are paused'
                    : undefined
      }
      message={
        code === 'credential-revoked' ? (
          'Nothing to replace. Create a new key instead.'
        ) : code === 'credential-limit' ? (
          'A subscription has one active key. Regenerate it to get a new one.'
        ) : problem.type.endsWith('/email-not-verified') ? (
          <>
            <p>{problem.detail}</p>
            <ResendVerification email={user?.email || ''} />
          </>
        ) : problem.type.endsWith('/team-role-forbidden') ? (
          'Your role in this team may have changed. Nothing changed.'
        ) : code === 'request-pending' ? (
          'This subscription already has a plan change waiting.'
        ) : code === 'app-revoked' ? (
          "This subscription was revoked, so its plan can't change."
        ) : code === 'admin-assigned-only' ? (
          'Plans for this product are set by your portal admin.'
        ) : problem.status === 503 ? (
          `We couldn't reach the API gateway, so ${unchanged}. Try again in a moment.`
        ) : problem.status === 502 ? (
          `${unchanged}. If this keeps happening, tell your portal admin.`
        ) : paused ? (
          `The portal admin has paused the gateway connection. ${unchanged}.`
        ) : undefined
      }
      onRetry={problem.status === 503 ? retry : undefined}
    />
  );
}
export function ProductActions({ product }: { product: Product }) {
  const { user } = usePortal();
  const { current, teams = [] } = useTeams();
  const apps = useResource(() =>
    user
      ? api.GET('/v1/apps', { params: { query: { teamId: current?.id } } })
      : Promise.resolve({ data: { items: [] } }),
  );
  const [requestPlan, setRequestPlan] = useState<Product['plans'][number]>();
  const [sentPlans, setSentPlans] = useState<string[]>([]);
  const requests = useResource(() =>
    user && current
      ? api.GET('/v1/access-requests', {
          params: { query: { teamId: current.id } },
        })
      : Promise.resolve({ data: { items: [] } }),
  );
  const scope = useRef(current?.id);
  useEffect(() => {
    if (scope.current !== current?.id) {
      scope.current = current?.id;
      void apps.reload();
      setSentPlans([]);
      void requests.reload();
    }
  }, [current?.id, apps.reload]);
  const existing =
    apps.data?.items.filter((a) => a.plan?.product?.id === product.id) || [];
  return (
    <>
      <PlanTable
        product={product}
        action={(p) => {
          if (user?.role === 'admin') return null;
          if (product.selfService === false) return null;
          if (
            current?.role === 'read-only' &&
            !teams.some((t) => t.role !== 'read-only')
          )
            return (
              <Button disabled>
                {p.requiresApproval ? 'Request access' : 'Subscribe'}
              </Button>
            );
          if (p.requiresApproval) {
            const isPending =
              sentPlans.includes(p.id) ||
              requests.data?.items.some(
                (r) => r.plan.id === p.id && r.status === 'pending',
              );
            return (
              <div className="stack">
                {user ? (
                  isPending &&
                  teams.filter((t) => t.role !== 'read-only').length <= 1 ? (
                    <p>Request pending</p>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => setRequestPlan(p)}
                    >
                      Request access
                    </Button>
                  )
                ) : (
                  <a
                    className="button secondary"
                    href={`/sign-in?next=${encodeURIComponent(`/products/${product.slug}`)}`}
                  >
                    Request access
                  </a>
                )}
                {isPending && (
                  <p>
                    Your team has a pending request ·{' '}
                    <a id={`pending-${p.id}`} href="/dashboard#requests">
                      View requests
                    </a>
                  </p>
                )}
              </div>
            );
          }
          return (
            <a
              className="button"
              href={
                user
                  ? `/products/${product.slug}/subscribe?plan=${p.id}`
                  : `/sign-in?next=${encodeURIComponent(`/products/${product.slug}/subscribe?plan=${p.id}`)}`
              }
            >
              {user ? `Subscribe to ${p.name}` : 'Sign in to subscribe'}
            </a>
          );
        }}
      />
      {user?.role === 'admin' && (
        <p className="muted admin-developer-note">Portal admins can&apos;t subscribe. Use a developer account to get a key.</p>
      )}
      {product.selfService === false && (
        <p className="muted">
          Access to this product is set up by your portal admin.
        </p>
      )}
      {requestPlan && (
        <RequestAccess
          plan={requestPlan}
          productName={product.name}
          open
          onClose={() => setRequestPlan(undefined)}
          onSent={() => {
            const id = requestPlan.id;
            setSentPlans((p) => [...p, id]);
            requestAnimationFrame(() =>
              document.getElementById(`pending-${id}`)?.focus(),
            );
          }}
        />
      )}
      {current?.role === 'read-only' && (
        <p>
          You have Read-only access to {current.name}. Ask a team Admin or
          Member to request access.
        </p>
      )}
      {user && apps.error && (
        <ProblemAlert
          problem={apps.error}
          message="We couldn't load your subscriptions."
          onRetry={apps.reload}
        />
      )}
      {!!existing.length && (
        <p>
          You have {existing.length} subscription(s) to {product.name}:{' '}
          {existing.map((a) => (
            <span key={a.id}>
              {a.name} ({a.plan.name}){' '}
              <a href={`/dashboard/apps/${a.id}`}>View</a>{' '}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
export function Subscribe({
  product,
  initialPlan,
}: {
  product: Product;
  initialPlan?: string;
}) {
  const router = useRouter();
  const { current, unavailable } = useTeams();
  const { setReveal, user } = usePortal();
  const [planId, setPlan] = useState(
    product.plans.find((p) => p.id === initialPlan)?.id ||
      product.plans[0]?.id ||
      '',
  );
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit() {
    if (lock.current || !current || unavailable) return;
    if (!name.trim() || name.trim().length > 80) {
      requestAnimationFrame(() =>
        document.getElementById('subscription-name')?.focus(),
      );
      setErrors({
        name: !name.trim()
          ? 'Enter a name for this subscription.'
          : 'Use 80 characters or fewer.',
      });
      return;
    }
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    setErrors({});
    try {
      const result = await api.POST('/v1/apps', {
        body: { name: name.trim(), planId, teamId: current.id },
      });
      if (result.error) {
        setProblem(result.error);
        if (result.error.type.endsWith('/app-name-taken'))
          setErrors({
            name: `A subscription or app in ${current.name} already has this name. Choose another name.`,
          });
        else
          setErrors(
            Object.fromEntries(
              (result.error.errors || []).map((e) => [
                e.pointer?.slice(1) || 'name',
                e.message,
              ]),
            ),
          );
      } else if (result.data) {
        setReveal({
          app: result.data.app,
          credential: result.data.credential,
          variant: 'first',
        });
        router.push(`/dashboard/apps/${result.data.app.id}`);
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (problem?.type.endsWith('/team-role-forbidden'))
    return (
      <>
        <ProblemAlert
          problem={problem}
          title={`You can't subscribe in ${current?.name || 'this team'}`}
          message="Your role in this team may have changed. Nothing was created."
        />
        <a href={`/products/${product.slug}`}>Back to {product.name}</a>
      </>
    );
  if (current?.role === 'read-only')
    return (
      <p>
        You have Read-only access to {current.name}, so you can&apos;t subscribe
        here. Switch to another team or ask a team Admin.
      </p>
    );
  if (product.selfService === false)
    return <p>Access to this product is set up by your portal admin.</p>;
  if (product.plans.find((p) => p.id === planId)?.requiresApproval)
    return (
      <>
        <p>This plan requires approval.</p>
        <RequestAccess
          plan={product.plans.find((p) => p.id === planId)!}
          productName={product.name}
          open
          onClose={() => router.push(`/products/${product.slug}`)}
          onSent={() => router.push('/dashboard#requests')}
        />
      </>
    );
  if (!product.plans.length)
    return (
      <p>
        This product has no plans yet, so you can&apos;t subscribe. Check back
        soon.
      </p>
    );
  return (
    <form
      className="stack form-column"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p>
        This subscription will belong to{' '}
        <strong>{current?.name || 'your team'}</strong>.
      </p>
      <PlanRadios
        plans={product.plans}
        value={planId}
        onChange={setPlan}
        disabled={pending}
      />
      {errors.planId && (
        <p role="alert">
          This plan is no longer available. Choose another plan.
        </p>
      )}
      <Field
        id="subscription-name"
        label="Subscription name"
        error={errors.name}
        hint={`A name for this key's use, such as staging or prod. Unique in ${current?.name || 'your team'}.`}
      >
        {(props) => (
          <Input
            {...props}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      {problem && (
        <ChangeProblem
          problem={problem}
          unchanged="no subscription or key was created"
          retry={submit}
        />
      )}
      {user?.verificationRequired && !user.emailVerified && (
        <p>Verify your email address before subscribing.</p>
      )}
      <div className="actions">
        <Button
          disabled={pending || !current || unavailable}
          aria-busy={pending}
        >
          {pending ? 'Subscribing…' : 'Subscribe and get key'}
        </Button>
        <a href={`/products/${product.slug}`}>Cancel</a>
      </div>
    </form>
  );
}

// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import type { components } from '@portal/sdk';
export type Plan = components['schemas']['Plan'];
export type Product = components['schemas']['ProductDetail'];
export type ProductSummary = components['schemas']['ProductSummary'];
type Limits =
  | Pick<Plan, 'rateLimit' | 'rateLimitUnit' | 'monthlyQuota'>
  | components['schemas']['AppPlan'];
const number = (value: number | null) =>
  new Intl.NumberFormat('en').format(value || 0);
export function PlanLimits({
  plan,
  variant = 'stacked',
}: {
  plan: Limits;
  variant?: 'inline' | 'stacked';
}) {
  if ('builtin' in plan && plan.builtin)
    return <span>No rate limit or monthly quota</span>;
  return (
    <span className={variant === 'stacked' ? 'stack' : undefined}>
      {number(plan.rateLimit)} requests per {plan.rateLimitUnit}
      {variant === 'inline' ? ' · ' : <br />}
      {number(plan.monthlyQuota)} requests per month
    </span>
  );
}
export const limitsCaption =
  "Limits cover all of a plan's APIs together. Monthly quotas reset at 00:00 UTC on the 1st.";
export function PlanTable({
  product,
  action,
}: {
  product: Product;
  action: (plan: Plan) => ReactNode;
}) {
  return (
    <>
      <div
        className="plan-comparison"
        role="region"
        aria-label="Plans"
        tabIndex={product.plans.length > 4 ? 0 : undefined}
      >
        <table>
          <caption>{limitsCaption}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Limit</span>
              </th>
              {product.plans.map((p) => (
                <th scope="col" key={p.id}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Rate limit</th>
              {product.plans.map((p) => (
                <td key={p.id}>
                  {number(p.rateLimit)} requests per {p.rateLimitUnit}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Monthly quota</th>
              {product.plans.map((p) => (
                <td key={p.id}>
                  {number(p.monthlyQuota)} requests per calendar month, UTC
                </td>
              ))}
            </tr>
            {product.apis.map((a) => (
              <tr key={a.id}>
                <th scope="row">{a.title}</th>
                {product.plans.map((p) => (
                  <td key={p.id}>
                    {p.apis.some((x) => x.id === a.id)
                      ? '✓ Included'
                      : '— Not included'}
                  </td>
                ))}
              </tr>
            ))}
            {product.plans.some((p) => p.description) && (
              <tr>
                <th scope="row">Description</th>
                {product.plans.map((p) => (
                  <td key={p.id}>{p.description}</td>
                ))}
              </tr>
            )}
            <tr>
              <th scope="row">
                <span className="sr-only">Subscribe</span>
              </th>
              {product.plans.map((p) => (
                <td key={p.id}>{action(p)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="plan-cards stack">
        <p className="muted">{limitsCaption}</p>
        {product.plans.map((p) => (
          <div className="card stack" key={p.id}>
            <h3>{p.name}</h3>
            <dl>
              <dt>Rate limit and monthly quota</dt>
              <dd>
                <PlanLimits plan={p} />
              </dd>
              <dt>Included APIs</dt>
              <dd>{p.apis.map((a) => a.title).join(', ')}</dd>
            </dl>
            <p>{p.description}</p>
            {action(p)}
          </div>
        ))}
      </div>
    </>
  );
}
export function PlanRadios({
  plans,
  value,
  onChange,
  disabled,
  current,
}: {
  current?: string;
  plans: Plan[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="stack">
      <legend>Plan</legend>
      {plans.map((p) => (
        <label className="card" key={p.id}>
          <input
            type="radio"
            name="plan"
            aria-label={p.name}
            value={p.id}
            checked={value === p.id}
            onChange={() => onChange(p.id)}
            aria-describedby={`limits-${p.id}`}
          />{' '}
          {p.name} {p.id === current && <span className="badge">Current</span>}
          <span id={`limits-${p.id}`} className="stack muted">
            <PlanLimits plan={p} variant="inline" />
            {p.apis.map((a) => a.title).join(', ')}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

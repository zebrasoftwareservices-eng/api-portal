// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
  Table,
} from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { Api, Problem } from '../lib/types';
import { validatePlan, type PlanFields } from '../lib/plan-validation';
import { Field } from './field';
import { type Product, type Plan } from './plans';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { SuccessNotice } from './success-notice';
import { DateValue } from './date';
export function AdminProducts() {
  const { data, error, loading, reload } = useResource(() =>
    api.GET('/v1/products'),
  );
  return (
    <div className="stack">
      <PageHeader
        title="Products"
        actions={
          <a className="button" href="/admin/products/new">
            Create product
          </a>
        }
      />
      {loading ? (
        <div className="skeleton" role="status">
          Loading products…
        </div>
      ) : error ? (
        <ProblemAlert
          problem={error}
          message="We couldn't load the products."
          onRetry={reload}
        />
      ) : !data?.items.length ? (
        <EmptyState
          title="No products yet"
          description="Group published APIs into a product, then add plans with rate limits and quotas."
          action={
            <a className="button" href="/admin/products/new">
              Create product
            </a>
          }
        />
      ) : (
        <Table>
          <caption className="sr-only">Products</caption>
          <thead>
            <tr>
              {['Name', 'Slug', 'APIs', 'Plans', 'Created'].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`/admin/products/${p.slug}`}>{p.name}</a>
                </td>
                <td className="mono">{p.slug}</td>
                <td>{p.apiCount} APIs</td>
                <td>{p.planCount} plans</td>
                <td>
                  <DateValue value={p.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
export function AdminProduct({
  product,
  notice,
}: {
  product: Product;
  notice?: string;
}) {
  return (
    <div className="stack">
      <SuccessNotice message={notice} />
      <PageHeader
        title={product.name}
        breadcrumb={[
          { label: 'Admin', href: '/admin/apis' },
          { label: 'Products', href: '/admin/products' },
          { label: product.name },
        ]}
        actions={
          <div className="actions">
            <a className="button" href={`/admin/products/${product.slug}/edit`}>
              Edit product
            </a>
            <a href={`/products/${product.slug}`}>View product page</a>
          </div>
        }
      />
      <p>
        {product.slug} · {product.apiCount} APIs
      </p>
      <h2>APIs</h2>
      <ul>
        {product.apis.map((a) => (
          <li key={a.id}>
            {a.title} v{a.version}
          </li>
        ))}
      </ul>
      <div className="page-header">
        <h2>Plans</h2>
        <a
          className="button"
          href={`/admin/products/${product.slug}/plans/new`}
        >
          Add plan
        </a>
      </div>
      <p className="muted">
        Changing a plan updates every subscription on it within a minute.
      </p>
      {!product.plans.length ? (
        <EmptyState
          title="No plans yet"
          description="Developers can't subscribe until the product has a plan."
        />
      ) : (
        <Table>
          <caption className="sr-only">Plans for {product.name}</caption>
          <thead>
            <tr>
              {['Name', 'Rate limit', 'Monthly quota', 'APIs', 'Actions'].map(
                (h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {product.plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  {p.rateLimit.toLocaleString('en')} requests per{' '}
                  {p.rateLimitUnit}
                </td>
                <td>
                  {p.monthlyQuota.toLocaleString('en')} requests per month
                </td>
                <td>{p.apis.map((a) => a.title).join(', ')}</td>
                <td>
                  <a
                    className="button secondary"
                    href={`/admin/products/${product.slug}/plans/${p.id}`}
                    aria-label={`Edit plan ${p.name}`}
                  >
                    Edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
export function ProductForm({
  product,
  apis,
}: {
  product?: Product;
  apis: Api[];
}) {
  return <Editor product={product} apis={apis} />;
}
export function PlanForm({ product, plan }: { product: Product; plan?: Plan }) {
  return <Editor product={product} plan={plan} apis={product.apis} planMode />;
}
function Editor({
  product,
  plan,
  apis,
  planMode = false,
}: {
  product?: Product;
  plan?: Plan;
  apis: Api[];
  planMode?: boolean;
}) {
  const router = useRouter();
  const editing = planMode ? !!plan : !!product;
  const [values, setValues] = useState<PlanFields>({
    name: (planMode ? plan?.name : product?.name) || '',
    description: (planMode ? plan?.description : product?.description) || '',
    rateLimit: plan ? String(plan.rateLimit) : '',
    rateLimitUnit: plan?.rateLimitUnit || 'second',
    monthlyQuota: plan ? String(plan.monthlyQuota) : '',
    apiIds:
      (planMode ? plan?.apis || product?.apis : product?.apis)?.map(
        (a) => a.id,
      ) || [],
  });
  const [slug, setSlug] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const title = planMode
    ? editing
      ? `Edit plan ${plan?.name}`
      : `Add a plan to ${product?.name}`
    : editing
      ? `Edit ${product?.name}`
      : 'Create product';
  useEffect(() => {
    document.title = `${Object.keys(errors).length ? 'Error: ' : ''}${title} · Admin · Developer Portal`;
    if (Object.keys(errors).length) summary.current?.focus();
  }, [errors, title]);
  const update = (field: keyof PlanFields, value: string | string[]) =>
    setValues((v) => ({ ...v, [field]: value }));
  async function save() {
    if (lock.current) return;
    let invalid: Record<string, string> = {};
    if (planMode) invalid = validatePlan(values);
    else {
      if (!values.name.trim()) invalid.name = 'Enter a product name.';
      else if (values.name.trim().length > 80)
        invalid.name = 'Use 80 characters or fewer.';
      if (!values.description.trim())
        invalid.description = 'Enter a description.';
      else if (values.description.length > 2000)
        invalid.description = 'Use 2,000 characters or fewer.';
      if (!values.apiIds.length) invalid.apiIds = 'Choose at least one API.';
      else if (values.apiIds.length > 50)
        invalid.apiIds = 'Choose 50 APIs or fewer.';
      if (!editing && slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        invalid.slug = 'Use lowercase letters, numbers and hyphens.';
    }
    setErrors(invalid);
    setProblem(undefined);
    if (Object.keys(invalid).length) return;
    lock.current = true;
    setPending(true);
    try {
      const body = {
        name: values.name.trim(),
        description: values.description,
        apiIds: values.apiIds,
      };
      let result;
      if (planMode && product) {
        const planBody = {
          ...body,
          rateLimit: Number(values.rateLimit),
          rateLimitUnit: values.rateLimitUnit as 'second' | 'minute',
          monthlyQuota: Number(values.monthlyQuota),
        };
        result = plan
          ? await api.PUT('/v1/admin/products/{productId}/plans/{planId}', {
              params: { path: { productId: product.id, planId: plan.id } },
              body: planBody,
            })
          : await api.POST('/v1/admin/products/{productId}/plans', {
              params: { path: { productId: product.id } },
              body: planBody,
            });
      } else
        result = product
          ? await api.PATCH('/v1/admin/products/{productId}', {
              params: { path: { productId: product.id } },
              body,
            })
          : await api.POST('/v1/admin/products', {
              body: { ...body, ...(slug ? { slug } : {}) },
            });
      if (result.error) {
        const error = result.error;
        setProblem(error);
        const fields = Object.fromEntries(
          (error.errors || []).map((e) => [
            e.pointer?.split('/')[1] || 'name',
            e.message,
          ]),
        );
        if (error.type.endsWith('/plan-name-taken'))
          fields.name = `${product?.name} already has a plan called ${values.name}. Choose another name.`;
        if (error.type.endsWith('/product-slug-taken'))
          fields[slug ? 'slug' : 'name'] =
            `Another product already uses /products/${slug || values.name.toLowerCase().replaceAll(' ', '-')}. Choose another slug.`;
        if (error.type.endsWith('/api-in-plan')) {
          const removed =
            product?.apis.filter((a) => !values.apiIds.includes(a.id)) || [];
          fields.apiIds = removed
            .map(
              (a) =>
                `${a.title} is in a plan. Remove it from those plans first: ${product?.plans
                  .filter((p) => p.apis.some((x) => x.id === a.id))
                  .map((p) => p.name)
                  .join(', ')}.`,
            )
            .join(' ');
        }
        if (error.status === 404)
          fields.apiIds =
            'One of these APIs is no longer published. Reload to see the current list.';
        setErrors(fields);
      } else if (result.data) {
        const target = 'slug' in result.data ? result.data.slug : product?.slug;
        const notice = `${editing ? 'Saved' : 'Created'} ${planMode ? 'plan ' : ''}${values.name.trim()}.${planMode && editing ? ' Subscriptions get the new limits within a minute.' : ''}`;
        router.push(
          `/admin/products/${target}?notice=${encodeURIComponent(notice)}`,
        );
        router.refresh();
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (!apis.length)
    return (
      <EmptyState
        title="Publish an API first"
        description="A product needs at least one published API."
        action={<a href="/admin/apis">Import an API</a>}
      />
    );
  const textField = (
    field: 'name' | 'description' | 'rateLimit' | 'monthlyQuota',
    label: string,
    hint?: string,
  ) => (
    <Field id={field} label={label} error={errors[field]} hint={hint}>
      {(props) =>
        field === 'description' ? (
          <Textarea
            {...props}
            value={values[field]}
            onChange={(e) => update(field, e.target.value)}
          />
        ) : (
          <Input
            {...props}
            inputMode={
              field === 'rateLimit' || field === 'monthlyQuota'
                ? 'numeric'
                : undefined
            }
            value={values[field]}
            onChange={(e) => update(field, e.target.value)}
          />
        )
      }
    </Field>
  );
  return (
    <div className="stack form-column">
      <PageHeader
        title={title}
        breadcrumb={[
          { label: 'Products', href: '/admin/products' },
          ...(product
            ? [{ label: product.name, href: `/admin/products/${product.slug}` }]
            : []),
          { label: title },
        ]}
      />
      <form
        noValidate
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {!!Object.keys(errors).length && (
          <div role="alert" className="alert error" tabIndex={-1} ref={summary}>
            <h2>Fix {Object.keys(errors).length} problems to save</h2>
            <ul>
              {Object.entries(errors).map(([field, message]) => (
                <li key={field}>
                  <a
                    href={`#${field}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(field)?.focus();
                    }}
                  >
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <fieldset disabled={pending} className="stack">
          <legend className="sr-only">{title}</legend>
          {textField('name', 'Name')}
          {!planMode &&
            (editing ? (
              <p>
                Slug: <code>{product?.slug}</code>
              </p>
            ) : (
              <Field
                id="slug"
                label="Slug"
                error={errors.slug}
                hint="Used in the product's address, /products/{slug}. Leave empty to make one from the name. Can't be changed later."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                )}
              </Field>
            ))}
          {textField(
            'description',
            'Description',
            planMode
              ? 'Up to 280 characters.'
              : 'Markdown. Shown on the product page.',
          )}
          {!planMode && (
            <p
              className="muted"
              aria-live={values.description.length >= 1900 ? 'polite' : 'off'}
            >
              {values.description.length} of 2,000
            </p>
          )}
          {planMode && (
            <>
              <fieldset className="stack">
                <legend>Rate limit</legend>
                {textField('rateLimit', 'Rate limit')}
                <Field
                  id="rateLimitUnit"
                  label="Per"
                  error={errors.rateLimitUnit}
                >
                  {(props) => (
                    <select
                      {...props}
                      value={values.rateLimitUnit}
                      onChange={(e) => update('rateLimitUnit', e.target.value)}
                    >
                      <option value="second">second</option>
                      <option value="minute">minute</option>
                    </select>
                  )}
                </Field>
              </fieldset>
              {textField(
                'monthlyQuota',
                'Monthly quota',
                'Requests per calendar month, UTC. Resets 00:00 UTC on the 1st.',
              )}
            </>
          )}
          <fieldset
            id="apiIds"
            tabIndex={-1}
            aria-describedby={errors.apiIds ? 'apis-error' : 'apis-hint'}
            aria-invalid={!!errors.apiIds}
            className="stack"
          >
            <legend>APIs</legend>
            <p id="apis-hint">
              Choose at least one.{' '}
              {planMode
                ? 'Only APIs in this product are available.'
                : 'An API can be in more than one product.'}
            </p>
            {apis.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={values.apiIds.includes(a.id)}
                  onChange={(e) =>
                    update(
                      'apiIds',
                      e.target.checked
                        ? [...values.apiIds, a.id]
                        : values.apiIds.filter((id) => id !== a.id),
                    )
                  }
                />{' '}
                {a.title} v{a.version}
              </label>
            ))}
            {errors.apiIds && (
              <p className="field-error" id="apis-error">
                {errors.apiIds}
              </p>
            )}
          </fieldset>
        </fieldset>
        {problem && !Object.keys(errors).length && (
          <ProblemAlert
            problem={problem}
            title={
              problem.status === 403
                ? 'Only portal admins can change products'
                : undefined
            }
            message={problem.status === 403 ? 'Nothing was saved.' : undefined}
          />
        )}
        <div className="actions">
          <Button disabled={pending} aria-busy={pending}>
            {pending
              ? editing
                ? 'Saving…'
                : 'Creating…'
              : planMode
                ? editing
                  ? 'Save plan'
                  : 'Create plan'
                : editing
                  ? 'Save changes'
                  : 'Create product'}
          </Button>
          <a
            href={
              product ? `/admin/products/${product.slug}` : '/admin/products'
            }
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

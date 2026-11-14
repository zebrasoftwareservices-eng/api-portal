// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Subscribe, ProductActions } from './product-actions';
import { PlanForm } from './admin-products';
import { AppPlanActions, RegenerateKeyButton } from './app-plan-actions';
import type { Product } from './plans';
import type { App } from '../lib/types';
const m = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  reveal: vi.fn(),
  reload: vi.fn(),
  setApp: vi.fn(),
  role: 'member',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, refresh: m.refresh }),
}));
vi.mock('../lib/client', () => ({
  api: { POST: m.post, PUT: m.put, DELETE: m.del, GET: m.get },
  networkProblem: () => ({
    status: 0,
    type: '/network',
    title: 'Network unavailable',
  }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: { id: 'user' }, setReveal: m.reveal }),
}));
vi.mock('./team-context', () => ({
  useTeams: () => ({ current: { id: 'team', name: 'Payments', role: m.role } }),
}));
const product: Product = {
  visibility: 'open',
  selfService: true,
  id: 'product',
  name: 'Orders',
  slug: 'orders',
  description: 'Order APIs',
  apiCount: 2,
  planCount: 2,
  createdAt: '2026-11-01T00:00:00Z',
  apis: [
    {
      id: 'orders',
      slug: 'orders',
      title: 'Orders API',
      version: '1',
      gatewayBaseUrl: '',
      publishedAt: '',
      products: [],
    },
    {
      id: 'returns',
      slug: 'returns',
      title: 'Returns API',
      version: '1',
      gatewayBaseUrl: '',
      publishedAt: '',
      products: [],
    },
  ],
  plans: [],
};
product.plans = [
  {
    id: 'free',
    productId: product.id,
    name: 'Free',
    description: 'Try it',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 10000,
    quotaPeriod: 'calendar-month-utc',
    requiresApproval: false,
    apis: [product.apis[0]!],
    createdAt: '',
  },
  {
    id: 'standard',
    productId: product.id,
    name: 'Standard',
    description: '',
    rateLimit: 50,
    rateLimitUnit: 'minute',
    monthlyQuota: 20000,
    quotaPeriod: 'calendar-month-utc',
    requiresApproval: false,
    apis: product.apis,
    createdAt: '',
  },
];
const app: App = {
  status: 'active',
  origin: 'self',
  keyIssued: true,
  pendingRequest: null,
  id: 'app',
  teamId: 'team',
  role: 'member',
  name: 'staging',
  plan: {
    id: 'standard',
    name: 'Standard',
    builtin: false,
    product: { id: product.id, name: product.name, slug: product.slug },
    rateLimit: 50,
    rateLimitUnit: 'minute',
    monthlyQuota: 20000,
  },
  subscriptions: product.apis.map((a) => ({
    apiId: a.id,
    slug: a.slug,
    title: a.title,
  })),
  credentials: [
    {
      id: 'old',
      kind: 'api-key',
      keyHint: 'hint',
      status: 'active',
      createdAt: '',
    },
  ],
  createdAt: '',
};
beforeEach(() => {
  vi.resetAllMocks();
  m.role = 'member';
  m.get.mockResolvedValue({ data: { items: [] } });
  m.reload.mockResolvedValue(undefined);
});
it('keeps the subscription name and plan on gateway failure, retries and hands off the key only in memory', async () => {
  const user = userEvent.setup();
  m.post
    .mockResolvedValueOnce({
      error: {
        status: 503,
        type: '/problems/gateway-unavailable',
        title: 'Unavailable',
      },
    })
    .mockResolvedValueOnce({
      data: { app, credential: { id: 'key', key: 'secret' } },
    });
  render(<Subscribe product={product} initialPlan="free" />);
  await user.type(screen.getByLabelText('Subscription name'), 'staging');
  await user.click(
    screen.getByRole('button', { name: 'Subscribe and get key' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no subscription or key was created',
  );
  expect(screen.getByLabelText('Subscription name')).toHaveValue('staging');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(m.post).toHaveBeenLastCalledWith('/v1/apps', {
    body: { name: 'staging', planId: 'free', teamId: 'team' },
  });
  expect(m.reveal).toHaveBeenCalledWith(
    expect.objectContaining({ app, credential: { id: 'key', key: 'secret' } }),
  );
  expect(m.push).toHaveBeenCalledWith('/dashboard/apps/app');
});
it('hides subscription controls for read-only members', async () => {
  m.role = 'read-only';
  render(
    <>
      <Subscribe product={product} />
      <ProductActions product={product} />
    </>,
  );
  expect(
    screen
      .getAllByRole('button')
      .every((button) => button.hasAttribute('disabled')),
  ).toBe(true);
  expect(
    screen.queryByRole('link', { name: /Subscribe to/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('shows every invalid plan field and keeps text values for decimals and negatives', async () => {
  const user = userEvent.setup();
  render(<PlanForm product={product} />);
  await user.type(screen.getByLabelText('Rate limit'), '2.5');
  await user.type(screen.getByLabelText('Monthly quota'), '-1');
  await user.click(screen.getByRole('button', { name: 'Create plan' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Fix 3 problems to save');
  expect(screen.getByLabelText('Rate limit')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(screen.getByLabelText('Monthly quota')).toHaveValue('-1');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(m.post).not.toHaveBeenCalled();
});
it('places all server pointers beside their fields and submits numeric limits through the SDK', async () => {
  const user = userEvent.setup();
  m.post.mockResolvedValue({
    error: {
      status: 400,
      type: '/problems/validation',
      title: 'Invalid',
      errors: [
        { pointer: '/rateLimit', message: 'Rate invalid' },
        { pointer: '/monthlyQuota', message: 'Quota invalid' },
      ],
    },
  });
  render(<PlanForm product={product} />);
  await user.type(screen.getByLabelText('Name'), 'Free');
  await user.type(screen.getByLabelText('Rate limit'), '5');
  await user.type(screen.getByLabelText('Monthly quota'), '10000');
  await user.click(screen.getByRole('button', { name: 'Create plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Rate invalid');
  expect(screen.getByLabelText('Rate limit')).toHaveAccessibleDescription(
    /Rate invalid/,
  );
  expect(screen.getByLabelText('Monthly quota')).toHaveAccessibleDescription(
    /Quota invalid/,
  );
  expect(m.post).toHaveBeenCalledWith(
    '/v1/admin/products/{productId}/plans',
    expect.objectContaining({
      body: {
        name: 'Free',
        description: '',
        rateLimit: 5,
        rateLimitUnit: 'second',
        monthlyQuota: 10000,
        requiresApproval: false,
        apiIds: ['orders', 'returns'],
      },
    }),
  );
});
it('warns about dropped APIs and carries usage over when changing plans, keeping the dialog on gateway failure', async () => {
  const user = userEvent.setup();
  m.get.mockResolvedValue({ data: product });
  m.put
    .mockResolvedValueOnce({
      error: {
        status: 503,
        type: '/problems/gateway-unavailable',
        title: 'Unavailable',
      },
    })
    .mockResolvedValueOnce({
      data: { ...app, plan: { ...app.plan, name: 'Free', id: 'free' } },
    });
  render(<AppPlanActions app={app} reload={m.reload} setApp={m.setApp} />);
  await user.click(screen.getByRole('button', { name: 'Change plan…' }));
  const dialog = screen.getByRole('dialog');
  await user.click(await within(dialog).findByRole('radio', { name: 'Free' }));
  expect(dialog).toHaveTextContent("Free doesn't include Returns API");
  expect(dialog).toHaveTextContent(
    "This month's requests so far count toward the new quota.",
  );
  await user.click(
    within(dialog).getByRole('button', { name: 'Change to Free' }),
  );
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Your key still works on Standard',
  );
  await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(m.setApp).toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Your key stays the same',
  );
});
it('requires cancellation confirmation and treats an already deleted app as success', async () => {
  const user = userEvent.setup();
  m.del.mockResolvedValue({
    error: { status: 404, type: '/problems/not-found', title: 'Gone' },
  });
  render(<AppPlanActions app={app} reload={m.reload} setApp={m.setApp} />);
  await user.click(
    screen.getByRole('button', { name: 'Cancel subscription…' }),
  );
  const dialog = screen.getByRole('alertdialog');
  expect(
    within(dialog).getByRole('button', { name: 'Keep subscription' }),
  ).toHaveFocus();
  expect(m.del).not.toHaveBeenCalled();
  await user.click(
    within(dialog).getByRole('button', { name: 'Cancel subscription' }),
  );
  expect(m.push).toHaveBeenCalledWith(
    expect.stringContaining('/dashboard?notice=Cancelled'),
  );
});
it('confirms regeneration, preserves the old key on failure and hands the new key to reveal once on success', async () => {
  const user = userEvent.setup();
  m.post
    .mockResolvedValueOnce({
      error: {
        status: 503,
        type: '/problems/gateway-unavailable',
        title: 'Unavailable',
      },
    })
    .mockResolvedValueOnce({ data: { id: 'new', key: 'new-secret' } });
  render(
    <RegenerateKeyButton
      app={app}
      credential={app.credentials[0]!}
      reload={m.reload}
    />,
  );
  await user.click(screen.getByRole('button', { name: /Regenerate key/ }));
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(
    within(dialog).getByRole('button', { name: 'Regenerate key' }),
  );
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Your current key still works',
  );
  expect(m.reveal).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
  expect(m.reveal).toHaveBeenCalledWith(
    expect.objectContaining({
      credential: { id: 'new', key: 'new-secret' },
      notice: expect.stringContaining('has stopped working'),
    }),
  );
});

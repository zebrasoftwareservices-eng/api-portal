// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { components } from '@portal/sdk';
import { RequestAccess, TeamRequests } from './access-requests';
import { AdminRequests } from './admin-requests';
import { ProductAccess } from './product-access';
import { AppDetail } from './app-detail';
import { AppPlanActions } from './app-plan-actions';
import { ProductActions } from './product-actions';
import type { Product } from './plans';
import type { AccessRequest } from './access-shared';
import type { App } from '../lib/types';
const m = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  reveal: vi.fn(),
  push: vi.fn(),
  role: 'member',
}));
vi.mock('../lib/client', () => ({
  api: { GET: m.get, POST: m.post, PUT: m.put, DELETE: m.del },
  networkProblem: () => ({
    type: '/problems/network',
    title: 'Offline',
    status: 0,
  }),
  retrySeconds: () => 0,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, refresh: vi.fn() }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: { id: 'user' }, setReveal: m.reveal }),
}));
vi.mock('./team-context', () => ({
  useTeams: () => ({
    current: { id: 'team', name: 'Acme', role: m.role },
    teams: [{ id: 'team', name: 'Acme', role: m.role }],
  }),
}));
const request: AccessRequest = {
  id: 'request',
  kind: 'subscribe',
  status: 'pending',
  team: { id: 'team', name: 'Acme' },
  product: { id: 'product', name: 'Payments', slug: 'payments' },
  plan: { id: 'partner', name: 'Partner' },
  fromPlan: null,
  app: null,
  name: 'checkout',
  reason: 'Production traffic',
  requester: { userId: 'user', name: 'Dana', email: 'dana@example.test' },
  submittedAt: '2026-11-14T00:00:00Z',
  decision: null,
};
const product: Product = {
  id: 'product',
  slug: 'payments',
  name: 'Payments',
  description: 'Payments APIs',
  visibility: 'open',
  selfService: true,
  apiCount: 0,
  planCount: 2,
  createdAt: '',
  apis: [],
  plans: [
    {
      id: 'basic',
      name: 'Basic',
      productId: 'product',
      description: '',
      requiresApproval: false,
      rateLimit: 60,
      rateLimitUnit: 'minute',
      monthlyQuota: 10000,
      quotaPeriod: 'calendar-month-utc',
      apis: [],
      createdAt: '',
    },
    {
      id: 'partner',
      name: 'Partner',
      productId: 'product',
      description: '',
      requiresApproval: true,
      rateLimit: 1000,
      rateLimitUnit: 'minute',
      monthlyQuota: 100000,
      quotaPeriod: 'calendar-month-utc',
      apis: [],
      createdAt: '',
    },
  ],
};
const app: App = {
  id: 'app',
  name: 'checkout',
  teamId: 'team',
  role: 'member',
  status: 'active',
  origin: 'request',
  keyIssued: false,
  pendingRequest: null,
  createdAt: '2026-11-14T00:00:00Z',
  subscriptions: [],
  credentials: [],
  plan: {
    id: 'basic',
    name: 'Basic',
    builtin: false,
    product: request.product,
    rateLimit: 60,
    rateLimitUnit: 'minute',
    monthlyQuota: 10000,
  },
};
const access: components['schemas']['ProductAccess'] = {
  productId: 'product',
  visibility: 'open',
  teams: [],
  subscriptions: [],
  revocation: { revoked: 0, pending: 0 },
};
beforeEach(() => {
  vi.resetAllMocks();
  m.role = 'member';
  m.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/access')) return { data: access };
    if (path === '/v1/admin/teams')
      return {
        data: {
          items: [
            {
              id: 'team',
              name: 'Acme',
              personal: false,
              ownerEmail: null,
              memberCount: 2,
            },
          ],
        },
      };
    if (path === '/v1/apps/{appId}') return { data: app };
    if (path === '/v1/products/{productSlug}') return { data: product };
    if (path === '/v1/products') return { data: { items: [product] } };
    return { data: { items: [] } };
  });
});
it('validates the request reason and sends trimmed plain text to the chosen team without issuing a key', async () => {
  const actor = userEvent.setup();
  const close = vi.fn();
  const sent = vi.fn();
  m.post.mockResolvedValue({ data: request });
  render(
    <RequestAccess
      plan={request.plan}
      productName="Payments"
      open
      onClose={close}
      onSent={sent}
    />,
  );
  await actor.click(screen.getByRole('button', { name: 'Send request' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Tell the admin why');
  expect(m.post).not.toHaveBeenCalled();
  await actor.type(screen.getByLabelText('Subscription name'), 'checkout');
  await actor.type(
    screen.getByLabelText('Why does your team need this plan?'),
    '  Production traffic  ',
  );
  await actor.click(screen.getByRole('button', { name: 'Send request' }));
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
  expect(m.post).toHaveBeenCalledWith('/v1/access-requests', {
    body: {
      planId: 'partner',
      teamId: 'team',
      name: 'checkout',
      reason: 'Production traffic',
      description: '',
    },
  });
  expect(m.reveal).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it('preserves the request fields on a duplicate-pending response and links to Requests', async () => {
  const actor = userEvent.setup();
  m.post.mockResolvedValue({
    error: { type: '/problems/request-pending', status: 409, title: 'Pending' },
  });
  render(
    <RequestAccess
      plan={request.plan}
      productName="Payments"
      initialName="checkout"
      open
      onClose={vi.fn()}
      onSent={vi.fn()}
    />,
  );
  await actor.type(
    screen.getByLabelText('Why does your team need this plan?'),
    'Reason',
  );
  await actor.click(screen.getByRole('button', { name: 'Send request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'already has a pending request',
  );
  expect(
    screen.getByLabelText('Why does your team need this plan?'),
  ).toHaveValue('Reason');
  expect(screen.getByRole('link', { name: 'View requests' })).toHaveAttribute(
    'href',
    '/dashboard#requests',
  );
});
it('hides all subscribe actions for a Manual product', async () => {
  render(
    <ProductActions
      product={{ ...product, visibility: 'manual', selfService: false }}
    />,
  );
  expect(
    screen.getByText('Access to this product is set up by your portal admin.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Subscribe/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Request access' }),
  ).not.toBeInTheDocument();
});
it('shows decision notes as escaped text and gives read-only users no request action', async () => {
  m.role = 'read-only';
  m.get.mockResolvedValue({
    data: {
      items: [
        {
          ...request,
          status: 'rejected',
          decision: {
            system: false,
            note: '<script>plain note</script>',
            decidedAt: request.submittedAt,
          },
        },
      ],
    },
  });
  render(<TeamRequests />);
  expect(await screen.findByText(/Note from admin:/)).toHaveTextContent(
    '<script>plain note</script>',
  );
  expect(screen.getByText('Rejected')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Request again' }),
  ).not.toBeInTheDocument();
});
it('keeps the admin decision dialog and note when the gateway is unavailable', async () => {
  const actor = userEvent.setup();
  m.get.mockResolvedValue({ data: { items: [request] } });
  m.post.mockResolvedValue({
    error: {
      type: '/problems/gateway-unavailable',
      title: 'Unavailable',
      status: 503,
    },
  });
  render(<AdminRequests />);
  await actor.click(await screen.findByRole('button', { name: 'Approve…' }));
  await actor.type(
    screen.getByLabelText('Note to the requester (included in the email)'),
    'Welcome',
  );
  await actor.click(screen.getByRole('button', { name: 'Approve request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "It's still pending",
  );
  expect(
    screen.getByLabelText('Note to the requester (included in the email)'),
  ).toHaveValue('Welcome');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('requires an admin rejection note before calling the server', async () => {
  const actor = userEvent.setup();
  m.get.mockResolvedValue({ data: { items: [request] } });
  render(<AdminRequests />);
  await actor.click(await screen.findByRole('button', { name: 'Reject' }));
  await actor.click(screen.getByRole('button', { name: 'Reject request' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Add a note so the requester knows why.',
  );
  expect(m.post).not.toHaveBeenCalled();
});
it('defaults confirmation to keep keys and submits the selected revoke choice only on confirmation', async () => {
  const actor = userEvent.setup();
  m.put
    .mockResolvedValueOnce({
      error: {
        type: '/problems/confirmation-required',
        title: 'Confirmation',
        status: 409,
        affectedTeams: 2,
        affectedSubscriptions: 3,
      },
    })
    .mockResolvedValueOnce({ data: { ...access, visibility: 'hidden' } });
  render(<ProductAccess product={product} />);
  await actor.click(await screen.findByRole('radio', { name: 'Hidden' }));
  await actor.click(screen.getByRole('button', { name: 'Save access' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByRole('radio', { name: /Keep them working/ }),
  ).toBeChecked();
  expect(m.put).toHaveBeenCalledTimes(1);
  await actor.click(within(dialog).getByRole('radio', { name: /Revoke them/ }));
  await actor.click(
    within(dialog).getByRole('button', { name: 'Save and revoke keys' }),
  );
  await waitFor(() =>
    expect(m.put).toHaveBeenLastCalledWith(
      '/v1/admin/products/{productId}/access',
      {
        params: { path: { productId: 'product' } },
        body: { visibility: 'hidden', existingSubscriptions: 'revoke' },
      },
    ),
  );
});
it('makes a 202 plan change pending while preserving the current plan and shows the success state', async () => {
  const actor = userEvent.setup();
  const setApp = vi.fn();
  m.put.mockResolvedValue({
    data: {
      ...request,
      kind: 'plan-change',
      app: { id: 'app', name: 'checkout' },
    },
    response: new Response(null, { status: 202 }),
  });
  render(
    <AppPlanActions
      app={app}
      reload={vi.fn()}
      setApp={setApp}
      section="plan"
    />,
  );
  await actor.click(screen.getByRole('button', { name: 'Change plan…' }));
  await actor.click(await screen.findByRole('radio', { name: 'Partner' }));
  await actor.type(screen.getByLabelText('Reason'), 'More traffic');
  await actor.click(
    screen.getByRole('button', { name: 'Request plan change' }),
  );
  expect(
    await screen.findByRole('heading', { name: '✓ Request sent' }),
  ).toBeInTheDocument();
  expect(setApp).toHaveBeenCalledWith(
    expect.objectContaining({
      plan: app.plan,
      pendingRequest: expect.objectContaining({ kind: 'plan-change' }),
    }),
  );
  expect(m.put).toHaveBeenCalledWith('/v1/apps/{appId}/plan', {
    params: { path: { appId: 'app' } },
    body: { planId: 'partner', reason: 'More traffic' },
  });
});
it('reveals the first approved key through the one-time handoff', async () => {
  const actor = userEvent.setup();
  const credential = {
    id: 'key',
    kind: 'api-key',
    key: 'secret',
    keyHint: 'cret',
    status: 'active',
    createdAt: request.submittedAt,
  };
  m.post.mockResolvedValue({
    data: credential,
    response: new Response(null, { status: 201 }),
  });
  render(<AppDetail appId="app" />);
  await actor.click(await screen.findByRole('button', { name: 'Reveal key' }));
  expect(m.reveal).toHaveBeenCalledWith(
    expect.objectContaining({ credential }),
  );
  expect(m.post).toHaveBeenCalledWith('/v1/apps/{appId}/credentials', {
    params: { path: { appId: 'app' } },
  });
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
it.each(['revoked', 'revoke-pending'] as const)(
  'disables subscription and key mutations for %s',
  async (status) => {
    m.get.mockResolvedValue({ data: { ...app, status } });
    render(<AppDetail appId="app" />);
    expect(
      await screen.findByRole('heading', { name: 'checkout' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reveal key' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change plan…' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'New key' }),
    ).not.toBeInTheDocument();
    if (status === 'revoke-pending')
      expect(
        screen.queryByRole('button', { name: 'Cancel subscription…' }),
      ).not.toBeInTheDocument();
    else
      expect(
        screen.getByRole('button', { name: 'Delete subscription' }),
      ).toBeInTheDocument();
  },
);

it('assigns a Manual product with keyboard team selection and leaves key reveal to the team', async () => {
  const actor = userEvent.setup();
  m.get.mockImplementation(async (path: string) =>
    path.endsWith('/access')
      ? { data: { ...access, visibility: 'manual' } }
      : {
          data: {
            items: [
              {
                id: 'team',
                name: 'Acme',
                personal: false,
                ownerEmail: null,
                memberCount: 2,
              },
            ],
          },
        },
  );
  m.post.mockResolvedValue({ data: { ...app, origin: 'admin' } });
  render(
    <ProductAccess
      product={{ ...product, visibility: 'manual', selfService: false }}
    />,
  );
  await actor.click(
    await screen.findByRole('button', { name: 'Assign to a team' }),
  );
  const search = screen.getByRole('combobox', { name: 'Search teams…' });
  await actor.click(search);
  await screen.findByRole('option', { name: 'Acme' });
  await actor.keyboard('{ArrowDown}{Enter}');
  expect(screen.getByLabelText('Subscription name')).toHaveValue(
    'acme-payments',
  );
  expect(m.post).not.toHaveBeenCalled();
  await actor.click(
    screen.getByRole('button', { name: 'Create subscription' }),
  );
  await waitFor(() =>
    expect(m.post).toHaveBeenCalledWith('/v1/admin/subscriptions', {
      body: { teamId: 'team', planId: 'basic', name: 'acme-payments' },
    }),
  );
  expect(m.reveal).not.toHaveBeenCalled();
});
it('does not reveal an approved key to a read-only member', async () => {
  m.get.mockResolvedValue({ data: { ...app, role: 'read-only' } });
  render(<AppDetail appId="app" />);
  expect(
    await screen.findByText('A team Admin or Member can reveal the key.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Reveal key' }),
  ).not.toBeInTheDocument();
  expect(m.post).not.toHaveBeenCalled();
});
it('shows a retrying notice for partially failed revocations on the Access panel', async () => {
  m.get.mockResolvedValue({
    data: {
      ...access,
      revocation: { revoked: 1, pending: 1 },
      subscriptions: [
        {
          appId: 'app',
          name: 'checkout',
          team: request.team,
          plan: request.plan,
          status: 'revoke-pending',
          origin: 'self',
        },
      ],
    },
  });
  render(<ProductAccess product={product} />);
  expect(
    await screen.findByText(/Revoking 1 subscriptions is still pending/),
  ).toHaveTextContent("We're retrying automatically");
  expect(screen.getByText('Revoke pending')).toBeInTheDocument();
});

// SPDX-License-Identifier: Apache-2.0
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateApp } from './create-app';
import type { Api } from '../lib/types';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  setReveal: vi.fn(),
  setUser: vi.fn(),
  portalUser: undefined as
    | undefined
    | {
        email: string;
        emailVerified: boolean;
        verificationRequired: boolean;
        role?: string;
      },
}));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get, POST: mocks.post },
  retrySeconds: () => 0,
  networkProblem: () => ({
    status: 0,
    title: 'Network failure',
    type: '/network',
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({
    setReveal: mocks.setReveal,
    setUser: mocks.setUser,
    user: mocks.portalUser,
  }),
}));
const api: Api = {
  publishedAt: '2026-11-15T00:00:00Z',
  products: [],
  id: 'api-1',
  slug: 'sample',
  title: 'Sample HTTP API',
  version: '1',
  gatewayBaseUrl: 'http://localhost:8000/sample',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.portalUser = undefined;
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: { items: path === '/v1/products' ? [] : [api] },
    }),
  );
});
describe('create app', () => {
  it('preselects the API, prevents repeat submits, preserves values on 503 and retries the same request', async () => {
    const user = userEvent.setup();
    mocks.post
      .mockResolvedValueOnce({
        error: {
          status: 503,
          type: '/problems/gateway-unavailable',
          title: 'Gateway unavailable',
          detail:
            "The API gateway didn't respond. Nothing was created. Try again in a moment.",
        },
        response: new Response(null, { status: 503 }),
      })
      .mockResolvedValueOnce({
        data: { app: { id: 'app-1' }, credential: { key: 'pk_one_time' } },
      });
    render(<CreateApp slug="sample" />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    await user.type(screen.getByLabelText('App name'), 'Weather bot');
    await user.click(
      screen.getByRole('button', { name: 'Create app and get key' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was created',
    );
    expect(screen.getByLabelText('App name')).toHaveValue('Weather bot');
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
    expect(mocks.setReveal).toHaveBeenCalledWith(
      expect.objectContaining({ credential: { key: 'pk_one_time' } }),
    );
    expect(mocks.replace).toHaveBeenCalledWith('/dashboard/apps/app-1');
  });
  it('disables submit while the request is pending', async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    mocks.post.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<CreateApp slug="sample" />);
    await user.type(await screen.findByLabelText('App name'), 'Bot');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    await user.click(
      screen.getByRole('button', { name: 'Create app and get key' }),
    );
    expect(
      screen.getByRole('button', { name: 'Creating app…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('App name')).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve({ data: { app: { id: 'a' }, credential: { key: 'pk_test' } } }),
    );
  });
  it('keeps the API access hint associated with the choices alongside validation errors', async () => {
    const user = userEvent.setup();
    render(<CreateApp />);
    const group = screen.getByRole('group', { name: 'APIs this app uses' });
    const hint = "This app's keys work only on the APIs you choose here.";
    expect(group).toHaveAccessibleDescription(hint);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    await user.type(screen.getByLabelText('App name'), 'Bot');
    await user.click(
      screen.getByRole('button', { name: 'Create app and get key' }),
    );
    expect(group).toHaveAccessibleDescription(
      `${hint} ⚠ Choose at least one API, or subscribe to a product above.`,
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('keeps the hint while the choices load and removes it when the empty state replaces the form', async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockImplementation((path: string) =>
      path === '/v1/products'
        ? Promise.resolve({ data: { items: [] } })
        : new Promise((r) => {
            resolve = r;
          }),
    );
    render(<CreateApp />);
    expect(screen.getByText('Loading APIs…')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'APIs this app uses' }),
    ).toHaveAccessibleDescription(/This app's keys work only/);
    await act(async () => resolve({ data: { items: [] } }));
    expect(screen.getByText('No APIs to use yet')).toBeInTheDocument();
    expect(
      screen.queryByText(/This app's keys work only/),
    ).not.toBeInTheDocument();
  });
  it('shows gateway-disabled as paused creation rather than a duplicate name', async () => {
    mocks.post.mockResolvedValue({
      error: {
        type: '/problems/gateway-disabled',
        status: 409,
        title: 'Gateway disabled',
      },
      response: new Response(null, { status: 409 }),
    });
    const user = userEvent.setup();
    render(<CreateApp slug="sample" />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    await user.type(screen.getByLabelText('App name'), 'Bot');
    await user.click(
      screen.getByRole('button', { name: 'Create app and get key' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'New apps and keys are paused',
    );
    expect(screen.getByLabelText('App name')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('App name')).toHaveValue('Bot');
  });
});

it('focuses the preselected app name once and leaves focus there when APIs load', async () => {
  let resolve!: (value: unknown) => void;
  mocks.get.mockImplementation((path: string) =>
    path === '/v1/products'
      ? Promise.resolve({ data: { items: [] } })
      : new Promise((r) => {
          resolve = r;
        }),
  );
  render(<CreateApp slug="sample" />);
  expect(screen.getByLabelText('App name')).toHaveFocus();
  await act(async () => resolve({ data: { items: [api] } }));
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByLabelText('App name')).toHaveFocus();
  expect(screen.getByRole('link', { name: 'My apps' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
});
it('moves focus to the heading when an empty API result removes the focused form', async () => {
  let resolve!: (value: unknown) => void;
  mocks.get.mockImplementation((path: string) =>
    path === '/v1/products'
      ? Promise.resolve({ data: { items: [] } })
      : new Promise((r) => {
          resolve = r;
        }),
  );
  render(<CreateApp slug="sample" />);
  expect(screen.getByLabelText('App name')).toHaveFocus();
  await act(async () => resolve({ data: { items: [] } }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
});

it('keeps Create app and get key focusable and prevents creation until email verification', async () => {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({ data: { items: path === '/v1/products' ? [] : [api] } }),
  );
  mocks.post.mockClear();
  mocks.portalUser = {
    email: 'ana@example.com',
    emailVerified: false,
    verificationRequired: true,
  };
  const actor = userEvent.setup();
  render(<CreateApp />);
  const button = await screen.findByRole('button', {
    name: 'Create app and get key',
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveAccessibleDescription(
    'Verify your email address first. Use the button at the top of the page.',
  );
  await actor.click(button);
  expect(mocks.post).not.toHaveBeenCalled();
});

const product = {
  id: 'product-1',
  slug: 'payments',
  name: 'Payments',
  description: '**Take payments**\nSecond line',
  apiCount: 1,
  planCount: 1,
  selfService: true,
  allPlansRequireApproval: false,
  visibility: 'open',
  createdAt: '2026-11-15T00:00:00Z',
};
const bundledApi = {
  ...api,
  id: 'payments-api',
  slug: 'payments',
  title: 'Payments API',
  products: [{ id: product.id, slug: product.slug, name: product.name }],
};
function lists(products = [product], apis = [api, bundledApi]) {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: { items: path === '/v1/products' ? products : apis },
    }),
  );
}
it('shows products before the form and offers only loose APIs, unchecked even when there is one', async () => {
  lists();
  render(<CreateApp />);
  expect(
    await screen.findByRole('link', { name: 'Subscribe to Payments' }),
  ).toHaveAttribute('href', '/products/payments');
  expect(screen.getByText('Take payments')).toBeInTheDocument();
  expect(screen.getByText('Includes: Payments API')).toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(
    screen
      .getByRole('heading', { name: 'Products' })
      .compareDocumentPosition(screen.getByLabelText('App name')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it.each([
  [{ planCount: 0 }, 'Not available yet', undefined],
  [
    { selfService: false },
    "An admin assigns this product's plans to your team.",
    'View product Payments',
  ],
  [
    { allPlansRequireApproval: true },
    'Every plan needs approval from the API owner.',
    'Request access to Payments',
  ],
])(
  'renders the product state %j without a plan picker or product checkbox',
  async (changes, note, link) => {
    lists([{ ...product, ...changes }]);
    render(<CreateApp />);
    expect(await screen.findByText(note)).toBeInTheDocument();
    if (link)
      expect(screen.getByRole('link', { name: link })).toHaveAttribute(
        'href',
        '/products/payments',
      );
    else
      expect(
        screen.queryByRole('link', { name: /Payments/ }),
      ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  },
);
it('offers admins an Add a plan link when the product has no plans', async () => {
  mocks.portalUser = {
    email: 'admin@example.com',
    emailVerified: true,
    verificationRequired: false,
    role: 'admin',
  };
  lists([{ ...product, planCount: 0, allPlansRequireApproval: true }]);
  render(<CreateApp />);
  expect(await screen.findByText('Needs a plan')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Add a plan to Payments' }),
  ).toHaveAttribute('href', '/admin/products/payments');
});
it('replaces the form with the product note when no loose APIs exist', async () => {
  lists([product], [bundledApi]);
  render(<CreateApp slug="payments" />);
  expect(
    await screen.findByText(
      'Every API here is offered as a product. Subscribe to one above to get a key.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('App name')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Create app and get key' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      'Payments API is offered in a product. Subscribe to Payments below.',
    ),
  ).toBeInTheDocument();
});
it('does not preselect a product API when a loose API is available', async () => {
  lists();
  render(<CreateApp slug="payments" />);
  await screen.findByRole('link', { name: 'Subscribe to Payments' });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
it('focuses the unchecked API on empty submission and clears its error after selection', async () => {
  lists();
  const actor = userEvent.setup();
  render(<CreateApp />);
  await screen.findByRole('link', { name: 'Subscribe to Payments' });
  await actor.type(screen.getByLabelText('App name'), 'Bot');
  await actor.click(
    screen.getByRole('button', { name: 'Create app and get key' }),
  );
  await waitFor(() => expect(screen.getByRole('checkbox')).toHaveFocus());
  expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(
    /Choose at least one API, or subscribe to a product above/,
  );
  expect(mocks.post).not.toHaveBeenCalled();
  await actor.click(screen.getByRole('checkbox'));
  expect(screen.queryByText(/⚠ Choose at least/)).not.toBeInTheDocument();
});
it('keeps products and the stale refusal visible after refreshing away the last loose API', async () => {
  lists([product], [api]);
  mocks.post.mockImplementation(async () => {
    lists([product], [{ ...api, products: bundledApi.products }]);
    return {
      error: {
        type: '/problems/api-in-product',
        status: 409,
        title: 'API offered in a product',
        detail: 'Sample is now offered in Payments.',
        products: [product],
      },
      response: new Response(null, { status: 409 }),
    };
  });
  const actor = userEvent.setup();
  render(<CreateApp slug="sample" />);
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  await actor.type(screen.getByLabelText('App name'), 'Bot');
  await actor.click(
    screen.getByRole('button', { name: 'Create app and get key' }),
  );
  expect(
    await screen.findByText("Nothing was created. We've refreshed the lists."),
  ).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Sample is now offered in Payments.',
  );
  await waitFor(() =>
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole('heading', { name: /That API is now in a product/ }),
  ).toHaveFocus();
  expect(
    screen.getAllByRole('link', { name: 'Subscribe to Payments' }),
  ).toHaveLength(2);
  expect(
    mocks.get.mock.calls.filter(([path]) => path === '/v1/products'),
  ).toHaveLength(2);
  expect(
    mocks.get.mock.calls.filter(([path]) => path === '/v1/apis'),
  ).toHaveLength(2);
});
it('allows the loose API form to work when products fail to load', async () => {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/v1/products'
        ? { error: { type: '/problems/network', status: 0 } }
        : { data: { items: [api] } },
    ),
  );
  render(<CreateApp />);
  expect(
    await screen.findByText("We couldn't load the products."),
  ).toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Create app and get key' }),
  ).toBeEnabled();
});
it('keeps product links available when APIs fail, and disables creation', async () => {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/v1/products'
        ? { data: { items: [product] } }
        : { error: { type: '/problems/network', status: 0 } },
    ),
  );
  render(<CreateApp />);
  expect(
    await screen.findByText("We couldn't load the APIs."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Subscribe to Payments' }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Includes:/)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Create app and get key' }),
  ).toBeDisabled();
});

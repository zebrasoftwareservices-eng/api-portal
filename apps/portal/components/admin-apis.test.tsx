// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApis } from './admin-apis';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const service = {
  id: 'svc',
  name: 'sample-svc',
  routes: [{ id: 'route', paths: ['/sample'] }],
  keyAuth: true,
};
function mockServices(items: (typeof service & { linkedApiSlug?: string })[]) {
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.includes('services')
        ? { items }
        : path.includes('health')
          ? { gateway: { reachable: true } }
          : { items: [] },
    }),
  );
}
async function fillUrlImport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('From a URL'));
  await user.type(
    screen.getByLabelText('Document URL'),
    'https://example.com/openapi.yaml',
  );
  await user.selectOptions(screen.getByLabelText('Kong service'), 'svc');
}
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get, POST: mocks.post },
  retrySeconds: () => 0,
  networkProblem: () => ({
    status: 0,
    title: 'Network failure',
    type: '/network',
  }),
}));
describe('admin import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices([service]);
  });
  it('submits URL source and shows the first validation error without losing form values', async () => {
    const user = userEvent.setup();
    const detail =
      "Invalid OpenAPI document: must have required property 'info' at /";
    mocks.post.mockResolvedValue({
      error: {
        status: 422,
        type: '/problems/invalid-openapi',
        title: 'Invalid OpenAPI',
        detail,
        errors: [{ pointer: '/', message: 'Missing info' }],
      },
      response: new Response(null, { status: 422 }),
    });
    render(<AdminApis />);
    await user.click(await screen.findByLabelText('From a URL'));
    await user.type(
      screen.getByLabelText('Document URL'),
      'https://example.com/openapi.yaml',
    );
    await user.selectOptions(
      await screen.findByLabelText('Kong service'),
      'svc',
    );
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nothing was published.',
    );
    expect(screen.getByLabelText('Document URL')).toHaveValue(
      'https://example.com/openapi.yaml',
    );
    expect(mocks.post).toHaveBeenCalledWith('/v1/admin/apis', {
      body: {
        spec: { url: 'https://example.com/openapi.yaml' },
        gatewayServiceId: 'svc',
      },
    });
  });
  it('reads files as content, resets after publishing and links to the reference', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      data: { id: 'api', title: 'Orders', slug: 'orders', warnings: [] },
      response: new Response(null, { status: 201 }),
    });
    render(<AdminApis />);
    const file = new File(['openapi: 3.1.0'], 'orders.yaml', {
      type: 'application/yaml',
    });
    Object.defineProperty(file, 'text', {
      value: async () => 'openapi: 3.1.0',
    });
    await user.upload(await screen.findByLabelText('OpenAPI file'), file);
    await user.selectOptions(screen.getByLabelText('Kong service'), 'svc');
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/v1/admin/apis', {
        body: { spec: { content: 'openapi: 3.1.0' }, gatewayServiceId: 'svc' },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'View Orders' }),
    ).toHaveAttribute('href', '/apis/orders');
    expect(screen.getByLabelText('Kong service')).toHaveValue('');
  });
  it.each([
    {
      type: 'gateway-service-has-acl',
      title: 'Another ACL plugin applies to this service',
      detail:
        "An ACL plugin this portal didn't create applies to the Kong service sample-svc, either on the service, on one of its routes or globally. The portal can't control access while it's there, so it hasn't changed this service's plugins.",
      field:
        "This service has an ACL plugin the portal didn't create. Remove it in Kong and try again, or choose another service.",
    },
    {
      type: 'gateway-service-already-linked',
      title: 'This service already has a published API',
      detail:
        'This Kong service already serves /apis/orders. A Kong service can serve only one published API, because access is granted per service.',
      field:
        'This service already serves a published API. Choose another service, or add a version to that API.',
    },
  ])(
    'keeps values and focuses the service for $type, then clears the refusal on selection',
    async ({ type, title, detail, field }) => {
      const user = userEvent.setup();
      mockServices([service, { ...service, id: 'other', name: 'other-svc' }]);
      mocks.post.mockResolvedValue({
        error: { status: 422, type: `/problems/${type}`, title, detail },
        response: new Response(null, { status: 422 }),
      });
      render(<AdminApis />);
      await fillUrlImport(user);
      await user.click(
        screen.getByRole('button', { name: 'Import and publish' }),
      );
      const select = screen.getByLabelText('Kong service');
      await waitFor(() => expect(select).toHaveFocus());
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAccessibleDescription(`⚠ ${field}`);
      expect(select).toHaveValue('svc');
      expect(screen.getByLabelText('Document URL')).toHaveValue(
        'https://example.com/openapi.yaml',
      );
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(detail);
      expect(alert).toHaveTextContent('Nothing was published.');
      expect(
        mocks.get.mock.calls.filter(([path]) => path.includes('services')),
      ).toHaveLength(1);
      await user.selectOptions(select, 'other');
      expect(select).toHaveAttribute('aria-invalid', 'false');
      expect(select).toHaveAccessibleDescription(
        /Publishing limits this service/,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(`⚠ ${field}`)).not.toBeInTheDocument();
    },
  );
  it('focuses the committed invalid field after a delayed refusal without relying on animation frames', async () => {
    const user = userEvent.setup();
    let refuse!: (value: unknown) => void;
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        refuse = resolve;
      }),
    );
    render(<AdminApis />);
    await fillUrlImport(user);
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    const select = screen.getByLabelText('Kong service');
    expect(select).toBeDisabled();
    const focusOrder: string[] = [];
    const recordFocus = (event: FocusEvent) => {
      if (event.target === select) focusOrder.push('service');
      else if ((event.target as HTMLElement).getAttribute('role') === 'alert')
        focusOrder.push('alert');
    };
    document.addEventListener('focusin', recordFocus);
    // A delayed/throttled animation frame must not decide when React's DOM is ready.
    const frame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 0);
    try {
      refuse({
        error: {
          status: 422,
          type: '/problems/gateway-service-has-acl',
          title: 'Another ACL plugin applies to this service',
        },
        response: new Response(null, { status: 422 }),
      });
      await waitFor(() => expect(select).toHaveFocus());
      expect(select).toBeEnabled();
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(focusOrder).toEqual(['alert', 'service']);
    } finally {
      frame.mockRestore();
      document.removeEventListener('focusin', recordFocus);
    }
  });
  it('keeps unrelated import problems when the service changes', async () => {
    const user = userEvent.setup();
    mockServices([service, { ...service, id: 'other', name: 'other-svc' }]);
    mocks.post.mockResolvedValue({
      error: {
        status: 422,
        type: '/problems/invalid-openapi',
        title: 'Invalid OpenAPI',
        detail: 'Missing info',
      },
      response: new Response(null, { status: 422 }),
    });
    render(<AdminApis />);
    await fillUrlImport(user);
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    await screen.findByRole('alert');
    await user.selectOptions(screen.getByLabelText('Kong service'), 'other');
    expect(screen.getByRole('alert')).toHaveTextContent('Missing info');
  });
  it('warns that an unprotected API will be public and leaves publishing enabled', async () => {
    const user = userEvent.setup();
    mockServices([{ ...service, keyAuth: false }]);
    render(<AdminApis />);
    await screen.findByRole('option', { name: /sample-svc/ });
    await user.selectOptions(screen.getByLabelText('Kong service'), 'svc');
    expect(screen.getByText(/This API will be public/)).toHaveTextContent(
      "⚠ This API will be public. Key-auth isn't enabled on this service, so anyone can call it without a key. To require keys, enable the key-auth plugin on the service in Kong, then select Refresh list.",
    );
    expect(
      screen.getByRole('button', { name: 'Import and publish' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows only the linked-service warning even when key-auth is off, and lets the server decide', async () => {
    const user = userEvent.setup();
    mockServices([{ ...service, keyAuth: false, linkedApiSlug: 'orders' }]);
    render(<AdminApis />);
    await screen.findByRole('option', { name: /sample-svc/ });
    await user.selectOptions(screen.getByLabelText('Kong service'), 'svc');
    expect(screen.getByText(/This service already serves/)).toHaveTextContent(
      '⚠ This service already serves /apis/orders. To publish a new version of that API, add a version to it instead.',
    );
    expect(
      screen.queryByText(/This API will be public/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Publishing limits this service/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Import and publish' }),
    ).toBeEnabled();
  });
  it('keeps all server warnings in order after resetting, describes the focused success, and clears on the next submit', async () => {
    const user = userEvent.setup();
    const warnings = [
      {
        code: 'partial-key-auth',
        message:
          "Key-auth is on only some of this service's routes. Keys are checked on those routes, and the other routes stay open to anyone. To protect them, enable key-auth on the service in Kong.",
      },
      {
        code: 'api-public',
        message:
          "This API is public. Key-auth isn't enabled on this service, so anyone can call it without a key. To require keys, enable the key-auth plugin on the service in Kong.",
      },
      {
        code: 'future-code',
        message: 'A future server warning is also shown.',
      },
    ];
    mocks.post
      .mockResolvedValueOnce({
        data: { id: 'api', title: 'Orders', slug: 'orders', warnings },
        response: new Response(null, { status: 201 }),
      })
      .mockResolvedValueOnce({
        error: {
          status: 422,
          type: '/problems/invalid-openapi',
          title: 'Invalid OpenAPI',
        },
        response: new Response(null, { status: 422 }),
      });
    render(<AdminApis />);
    await fillUrlImport(user);
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    const success = (
      await screen.findByRole('link', { name: 'View Orders' })
    ).closest('[role="status"]')!;
    await waitFor(() => expect(success).toHaveFocus());
    expect(screen.getByLabelText('Kong service')).toHaveValue('');
    const ids = success.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(warnings.length);
    ids.forEach((id, index) => {
      const warning = document.getElementById(id)!;
      expect(warning).toHaveTextContent(`⚠ ${warnings[index]!.message}`);
      expect(warning).not.toHaveAttribute('role', 'alert');
    });
    expect(success).toHaveAccessibleDescription(
      warnings.map(({ message }) => `⚠ ${message}`).join(' '),
    );
    expect(within(success as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/apis/orders',
    );
    await fillUrlImport(user);
    expect(
      screen.getByText(warnings[2]!.message, { exact: false }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('link', { name: 'View Orders' }),
    ).not.toBeInTheDocument();
    warnings.forEach(({ message }) =>
      expect(
        screen.queryByText(message, { exact: false }),
      ).not.toBeInTheDocument(),
    );
  });
  it('describes the service effects only for an unlinked service with key-auth', async () => {
    const user = userEvent.setup();
    mockServices([
      service,
      { ...service, id: 'other', name: 'other-svc', keyAuth: false },
    ]);
    render(<AdminApis />);
    await screen.findByRole('option', { name: /sample-svc/ });
    const select = screen.getByLabelText('Kong service');
    expect(select).not.toHaveAttribute('aria-describedby');
    await user.selectOptions(select, 'svc');
    expect(select).toHaveAccessibleDescription(
      'Publishing limits this service to apps that include this API. Other Kong consumers lose access until you add them to its group, and Kong stops forwarding API keys to the upstream. See the upgrade notes.',
    );
    await user.selectOptions(select, 'other');
    expect(select).not.toHaveAttribute('aria-describedby');
    expect(
      screen.queryByText(/Publishing limits this service/),
    ).not.toBeInTheDocument();
  });
  it.each(['gateway-disabled', 'gateway-not-connected'])(
    'blocks the initial form for %s and keeps the catalog',
    async (code) => {
      mocks.get.mockImplementation((path: string) =>
        Promise.resolve(
          path.includes('services')
            ? { error: { type: `/problems/${code}`, status: 409, title: code } }
            : {
                data: path.includes('health')
                  ? { gateway: null }
                  : { items: [] },
              },
        ),
      );
      render(<AdminApis />);
      expect(screen.queryByLabelText('OpenAPI file')).not.toBeInTheDocument();
      expect(
        await screen.findByRole('link', { name: 'Go to Gateways' }),
      ).toHaveAttribute('href', '/admin/gateways');
      expect(screen.queryByLabelText('Kong service')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Published APIs' }),
      ).toBeInTheDocument();
    },
  );
  it('keeps all entries through failed service refresh and a stale disabled submit', async () => {
    const user = userEvent.setup();
    render(<AdminApis />);
    await fillUrlImport(user);
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('services')
          ? {
              error: {
                type: '/problems/gateway-unavailable',
                title: 'Gateway unavailable',
                status: 503,
              },
            }
          : { data: { items: [] } },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check that Kong is running, then refresh the list.',
    );
    expect(screen.getByLabelText('Document URL')).toHaveValue(
      'https://example.com/openapi.yaml',
    );
    expect(screen.getByLabelText('Kong service')).toHaveValue('svc');
    mockServices([service]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    mocks.post.mockResolvedValue({
      error: {
        type: '/problems/gateway-disabled',
        title: 'Gateway disabled',
        status: 409,
      },
      response: new Response(null, { status: 409 }),
    });
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was published, and your entries are still here.',
    );
    expect(screen.getByLabelText('Document URL')).toHaveValue(
      'https://example.com/openapi.yaml',
    );
  });
  it('shows all route paths in the selected-service hint', async () => {
    mockServices([
      {
        ...service,
        routes: [{ id: 'route', paths: ['/one', '/two', '/three'] }],
      },
    ]);
    render(<AdminApis />);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText('Kong service'),
      'svc',
    );
    expect(
      screen.getByRole('option', {
        name: /sample-svc — \/one, \/two \+1 more/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Routes: /one, /two, /three.')).toBeInTheDocument();
  });
});

it('shows lint locations in the original import form and keeps source values', async () => {
  mockServices([service]);
  const user = userEvent.setup();
  mocks.post.mockResolvedValue({
    error: {
      type: '/problems/openapi-lint-failed',
      title: 'Lint failed',
      status: 422,
      errorCount: 1,
      errors: [
        {
          rule: 'path-params',
          message: 'Declare id',
          pointer: '/paths/~1orders~1{id}',
          line: 7,
          column: 3,
        },
      ],
    },
    response: new Response(null, { status: 422 }),
  });
  render(<AdminApis />);
  await fillUrlImport(user);
  await user.click(screen.getByRole('button', { name: 'Import and publish' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('1 error stops this document');
  expect(alert).toHaveTextContent('path-params');
  expect(alert).toHaveTextContent('Line 7, column 3');
  expect(alert).toHaveTextContent('/paths/~1orders~1{id}');
  expect(alert).toHaveFocus();
  expect(screen.getByLabelText('Document URL')).toHaveValue(
    'https://example.com/openapi.yaml',
  );
});
it('offers a URL-preserving link to add a version to an already linked service', async () => {
  mockServices([{ ...service, linkedApiSlug: 'orders' }]);
  const user = userEvent.setup();
  render(<AdminApis />);
  await fillUrlImport(user);
  expect(
    screen.getByRole('link', { name: 'Add a version to /apis/orders' }),
  ).toHaveAttribute(
    'href',
    '/admin/apis/orders?url=https%3A%2F%2Fexample.com%2Fopenapi.yaml#add-version',
  );
});
it('shows the ruleset banner and refuses retry for ruleset failures', async () => {
  mockServices([service]);
  const user = userEvent.setup();
  mocks.post.mockResolvedValue({
    error: {
      type: '/problems/lint-ruleset-unavailable',
      status: 503,
      title: 'Unavailable',
      detail: '/rules.yaml missing',
    },
    response: new Response(null, { status: 503 }),
  });
  render(<AdminApis />);
  await fillUrlImport(user);
  await user.click(screen.getByRole('button', { name: 'Import and publish' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Imports are paused',
  );
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

describe('spec 003 import recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices([service]);
  });
  it('JSO-184 displays syntax-error line and column and clears the alert before client validation', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      error: {
        status: 422,
        type: '/problems/invalid-openapi',
        title: 'invalid-openapi',
        errors: [{ line: 12, column: 3, message: 'Unexpected token' }],
      },
      response: new Response(null, { status: 422 }),
    });
    render(<AdminApis />);
    await fillUrlImport(user);
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Line 12, column 3: Unexpected token',
    );
    await user.clear(screen.getByLabelText('Document URL'));
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Document URL')).toHaveFocus();
  });
  it('opens and focuses the required slug field without an alert', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      error: {
        status: 422,
        type: '/problems/slug-required',
        title: 'Slug required',
        errors: [
          {
            pointer: '/slug',
            message:
              'Enter a slug. The title has no letters or digits to make one from.',
          },
        ],
      },
      response: new Response(null, { status: 422 }),
    });
    render(<AdminApis />);
    await fillUrlImport(user);
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveFocus());
    expect(screen.getByLabelText('Slug')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('JSO-178 refreshes health along with the service list', async () => {
    const user = userEvent.setup();
    let reachable = false;
    mocks.get.mockImplementation(async (path: string) => ({
      data: path.includes('services')
        ? { items: [service] }
        : path.includes('health')
          ? { gateway: { reachable } }
          : { items: [] },
    }));
    render(<AdminApis />);
    await screen.findByText(/Admin API isn't responding/);
    reachable = true;
    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    await screen.findByText('Kong services refreshed.');
    expect(
      screen.queryByText(/Admin API isn't responding/),
    ).not.toBeInTheDocument();
  });
});

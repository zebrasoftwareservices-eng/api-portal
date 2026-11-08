// SPDX-License-Identifier: Apache-2.0
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateApp } from './create-app';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  setReveal: vi.fn(),
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
  usePortal: () => ({ setReveal: mocks.setReveal }),
}));
const api = {
  id: 'api-1',
  slug: 'sample',
  title: 'Sample HTTP API',
  version: '1',
  gatewayBaseUrl: 'http://localhost:8000/sample',
};
describe('create app', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({ data: { items: [api] } });
  });
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
    render(<CreateApp />);
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
    const hint =
      "This app's keys work only on the APIs you choose here. To use another API later, create another app.";
    expect(group).toHaveAccessibleDescription(hint);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('App name'), 'Bot');
    await user.click(
      screen.getByRole('button', { name: 'Create app and get key' }),
    );
    expect(group).toHaveAccessibleDescription(
      `${hint} ⚠ Choose at least one API.`,
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('keeps the hint while the choices load and removes it when the empty state replaces the form', async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<CreateApp />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading APIs');
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
  mocks.get.mockImplementation(
    () =>
      new Promise((r) => {
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
  mocks.get.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<CreateApp slug="sample" />);
  expect(screen.getByLabelText('App name')).toHaveFocus();
  await act(async () => resolve({ data: { items: [] } }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
});

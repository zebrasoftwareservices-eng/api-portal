// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ApiAccessProvider,
  ApiAccessAction,
  ApiAccessStatus,
  TryItRecovery,
} from './api-access';
import type { Access } from '../lib/access';
const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('../lib/access', async (original) => ({
  ...(await original<typeof import('../lib/access')>()),
  checkAccess: check,
}));
function deferred() {
  let resolve!: (value: Access) => void;
  const promise = new Promise<Access>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function Content() {
  return (
    <>
      <ApiAccessAction />
      <ApiAccessStatus />
      <p>
        <TryItRecovery />
      </p>
      <input aria-label="Reference value" />
    </>
  );
}
function page(signedIn = true, slug = 'orders') {
  return (
    <ApiAccessProvider signedIn={signedIn} slug={slug}>
      <Content />
    </ApiAccessProvider>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});
it('renders signed-out action without requesting apps', () => {
  render(page(false));
  expect(check).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Get an API key' })).toHaveAttribute(
    'href',
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dorders',
  );
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
it('keeps content usable during a check and never focuses the first action', async () => {
  const pending = deferred();
  check.mockReturnValue(pending.promise);
  render(page());
  const status = screen.getByRole('status');
  const input = screen.getByLabelText('Reference value');
  input.focus();
  fireEvent.change(input, { target: { value: 'my-key' } });
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(status).toBeEmptyDOMElement();
  await act(async () =>
    pending.resolve({ kind: 'one', app: { id: 'app', name: 'Worker' } }),
  );
  expect(screen.getByRole('link', { name: 'Open in Worker' })).toHaveAttribute(
    'href',
    '/dashboard/apps/app',
  );
  expect(input).toHaveFocus();
  expect(input).toHaveValue('my-key');
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toHaveTextContent(
    'Access checked. Your next step is at the top of the page.',
  );
});
it.each([{ kind: 'none' }, { kind: 'signed-out' }] as const)(
  'retains failure during retry and focuses recovered %j action',
  async (result) => {
    const retry = deferred();
    check
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockReturnValueOnce(retry.promise);
    render(page());
    await act(async () => {});
    const status = screen.getByRole('status');
    const input = screen.getByLabelText('Reference value');
    fireEvent.change(input, { target: { value: 'keep-this-key' } });
    const button = screen.getByRole('button', { name: 'Try again' });
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(check).toHaveBeenCalledTimes(2);
    expect(status).toHaveTextContent("Access status couldn't be confirmed");
    expect(button).toHaveTextContent('Checking…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    await act(async () => retry.resolve(result));
    expect(screen.getByRole('link', { name: 'Get an API key' })).toHaveFocus();
    expect(input).toHaveValue('keep-this-key');
    expect(screen.getByRole('status')).toBe(status);
  },
);
it('keeps the retry button focused when the retry fails again', async () => {
  check.mockResolvedValue({ kind: 'failed' });
  render(page());
  await act(async () => {});
  const button = screen.getByRole('button', { name: 'Try again' });
  button.focus();
  fireEvent.click(button);
  await act(async () => {});
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('status')).toHaveTextContent(
    "We still couldn't confirm your access.",
  );
});
it('fails at ten seconds, aborts the request, and ignores a late response during retry', async () => {
  const original = deferred();
  const retry = deferred();
  check
    .mockReturnValueOnce(original.promise)
    .mockReturnValueOnce(retry.promise);
  render(page());
  const signal = check.mock.calls[0]![1] as AbortSignal;
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => original.resolve({ kind: 'none' }));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByRole('button')).toHaveTextContent('Checking…');
  await act(async () => retry.resolve({ kind: 'several' }));
  expect(screen.getByRole('link', { name: 'View your apps' })).toHaveFocus();
});
it('ignores superseded and unmounted attempts, including Strict Mode', async () => {
  const old = deferred();
  const current = deferred();
  check.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<StrictMode>{page()}</StrictMode>);
  expect((check.mock.calls[0]![1] as AbortSignal).aborted).toBe(true);
  await act(async () => old.resolve({ kind: 'none' }));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await act(async () => current.resolve({ kind: 'several' }));
  expect(
    screen.getByRole('link', { name: 'View your apps' }),
  ).toBeInTheDocument();
  view.unmount();
  expect((check.mock.calls[1]![1] as AbortSignal).aborted).toBe(true);
});
it('reruns for a changed slug or signed-in state', async () => {
  check.mockResolvedValue({ kind: 'none' });
  const view = render(page());
  await act(async () => {});
  view.rerender(page(true, 'returns'));
  await act(async () => {});
  expect(check).toHaveBeenLastCalledWith('returns', expect.any(AbortSignal));
  view.rerender(page(false, 'returns'));
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dreturns',
  );
});

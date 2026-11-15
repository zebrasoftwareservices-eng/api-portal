// SPDX-License-Identifier: Apache-2.0
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppUsageCard } from './app-usage';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/client', () => ({ api: { GET: mocks.get } }));
const usage = {
  appId: 'app',
  period: { start: '2026-11-01T00:00:00Z', resetsAt: '2026-12-01T00:00:00Z' },
  quota: 1000,
  total: 20,
  byStatus: { '2xx': 12, '4xx': 5, '5xx': 3, other: 0 },
  collection: { status: 'ok', lastUpdatedAt: '2026-11-14T00:00:00Z' },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ data: usage });
});
afterEach(() => vi.useRealTimers());
it('shows the real count above a capped, accessible meter and warns at the quota', async () => {
  mocks.get.mockResolvedValue({ data: { ...usage, total: 1050 } });
  render(<AppUsageCard appId="app" />);
  const meter = await screen.findByRole('meter');
  expect(meter).toHaveAttribute('aria-valuenow', '1000');
  expect(meter).toHaveAttribute(
    'aria-valuetext',
    '1,050 of 1,000 calls, monthly quota reached',
  );
  expect(screen.getByText('105%')).toBeInTheDocument();
  expect(screen.getByText(/This app has reached/)).toHaveTextContent(
    '1 Dec 2026, 00:00 UTC',
  );
  expect(screen.getByText('Resets 1 Dec 2026, 00:00 UTC')).toBeInTheDocument();
  expect(screen.queryByText('Other (1xx, 3xx)')).not.toBeInTheDocument();
});
it('shows no bar for unlimited plans and includes nonzero Other counts', async () => {
  mocks.get.mockResolvedValue({
    data: { ...usage, quota: null, byStatus: { ...usage.byStatus, other: 2 } },
  });
  render(<AppUsageCard appId="app" />);
  expect(await screen.findByText('No monthly limit')).toBeInTheDocument();
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  expect(screen.getByText('Other (1xx, 3xx)')).toBeInTheDocument();
});
it.each(['unsupported', 'not-configured'])(
  'never presents missing usage as zero: %s',
  async (status) => {
    mocks.get.mockResolvedValue({
      data: {
        ...usage,
        total: null,
        byStatus: null,
        collection: { status, lastUpdatedAt: null },
      },
    });
    render(<AppUsageCard appId="app" />);
    expect(
      await screen.findByText("Usage isn't available for this gateway."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.queryByText('2xx Success')).not.toBeInTheDocument();
  },
);
it('suppresses never-received counts but preserves the reset date', async () => {
  mocks.get.mockResolvedValue({
    data: {
      ...usage,
      total: 0,
      collection: { status: 'behind', lastUpdatedAt: null },
    },
  });
  render(<AppUsageCard appId="app" />);
  expect(await screen.findByRole('meter')).toHaveAttribute(
    'aria-valuetext',
    'Usage not received yet',
  );
  expect(screen.queryByText('0')).not.toBeInTheDocument();
  expect(screen.queryByText('2xx Success')).not.toBeInTheDocument();
  expect(screen.getByText(/Resets/)).toBeInTheDocument();
});
it('lets the visitor retry initial failures and removes counts on lost access', async () => {
  mocks.get.mockRejectedValueOnce(new Error('offline'));
  render(<AppUsageCard appId="app" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load usage.",
  );
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('meter')).toBeInTheDocument();
  mocks.get.mockResolvedValue({ error: { status: 404 } });
  act(() => window.dispatchEvent(new Event('focus')));
  expect(
    await screen.findByText(/You no longer have access/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
});
it('keeps counts during background errors and alerts only after three consecutive failures', async () => {
  render(<AppUsageCard appId="app" />);
  await screen.findByRole('meter');
  mocks.get.mockRejectedValue(new Error('offline'));
  for (let i = 0; i < 3; i++) {
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(i + 2));
    if (i < 2) expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  }
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '20');
});
it('refreshes every minute only while visible and stops after unmount', async () => {
  vi.useFakeTimers();
  const view = render(<AppUsageCard appId="app" />);
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(60000);
  });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => {
    vi.advanceTimersByTime(60000);
  });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  view.unmount();
  await act(async () => {
    vi.advanceTimersByTime(60000);
  });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});

it('announces a quota level transition once while keeping behind counts', async () => {
  render(<AppUsageCard appId="app" />);
  await screen.findByRole('meter');
  const live = document.querySelector('[aria-live="polite"]');
  expect(live).toBeEmptyDOMElement();
  mocks.get.mockResolvedValue({ data: { ...usage, total: 800 } });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() =>
    expect(live).toHaveTextContent("80% of this month's quota used."),
  );
  mocks.get.mockResolvedValue({ data: { ...usage, total: 810 } });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() =>
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '810'),
  );
  expect(live).toHaveTextContent("80% of this month's quota used.");
  mocks.get.mockResolvedValue({
    data: {
      ...usage,
      collection: {
        status: 'behind',
        lastUpdatedAt: usage.collection.lastUpdatedAt,
      },
    },
  });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(live).toHaveTextContent('Usage may be behind'));
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '20');
});

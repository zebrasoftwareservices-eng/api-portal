// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminInsights } from './admin-insights';
import { formatDuration, formatUtc } from './usage-shared';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get },
  networkProblem: () => ({ status: 0 }),
}));
const developer = {
  userId: 'user',
  name: 'Dana',
  email: 'dana@example.test',
  signedUpAt: '2026-11-14T00:00:00Z',
  firstCallAt: null,
  secondsToFirstCall: null,
};
const insights = {
  window: { from: '2026-10-16T00:00:00Z', to: '2026-11-14T00:00:00Z' },
  signups: 7,
  activeApps: 2,
  topApis: [
    { apiId: 'api', slug: 'payments', name: 'Payments API', calls: 12480 },
  ],
  timeToFirstCall: {
    targetSeconds: 600,
    medianSeconds: 372,
    covered: 4,
    total: 7,
    developers: [developer],
  },
  collection: { status: 'ok', lastUpdatedAt: null },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ data: insights });
});
it('shows adoption, target, ranked API links and the developer cap', async () => {
  render(<AdminInsights />);
  expect(await screen.findByText('Within target')).toBeInTheDocument();
  expect(screen.getByText('6 min 12 s')).toHaveAttribute('datetime', 'PT372S');
  expect(screen.getByText(/4 of 7 developers/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Payments API' })).toHaveAttribute(
    'href',
    '/admin/apis/payments',
  );
  expect(screen.getByText('12,480')).toBeInTheDocument();
  expect(
    screen.getByText('Showing the 1 newest of 7 developers.'),
  ).toBeInTheDocument();
  expect(screen.getAllByText('No call yet').length).toBeGreaterThan(0);
});
it('shows no calls and no sign-ups as empty states', async () => {
  mocks.get.mockResolvedValue({
    data: {
      ...insights,
      activeApps: 0,
      topApis: [],
      timeToFirstCall: {
        ...insights.timeToFirstCall,
        medianSeconds: null,
        covered: 0,
        total: 0,
        developers: [],
      },
    },
  });
  render(<AdminInsights />);
  expect(await screen.findAllByText('No calls yet')).toHaveLength(2);
  expect(
    screen.getByText('No developers signed up in the last 30 days.'),
  ).toBeInTheDocument();
});
it.each(['unsupported', 'not-configured'])(
  'keeps sign-ups while suppressing unavailable usage: %s',
  async (status) => {
    mocks.get.mockResolvedValue({
      data: {
        ...insights,
        activeApps: null,
        topApis: null,
        collection: { status, lastUpdatedAt: null },
      },
    });
    render(<AdminInsights />);
    await screen.findByText("Usage isn't available for this gateway.");
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('Within target')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(3);
    if (status === 'not-configured')
      expect(
        screen.getByRole('link', { name: 'Go to Gateways' }),
      ).toHaveAttribute('href', '/admin/gateways');
  },
);
it('shows a focused permission page without any insight data', async () => {
  mocks.get.mockResolvedValue({ error: { status: 403 } });
  render(<AdminInsights />);
  expect(
    await screen.findByRole('heading', {
      name: "You don't have access to Insights",
    }),
  ).toHaveFocus();
  expect(screen.queryByText('New sign-ups')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to My apps' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
});
it('retries errors without retaining stale numbers', async () => {
  mocks.get.mockRejectedValueOnce(new Error('offline'));
  render(<AdminInsights />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load insights.",
  );
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Within target')).toBeInTheDocument();
});
it.each([
  [45, '45 s'],
  [3600 + 5 * 60, '1 h 5 min'],
  [2 * 86400 + 4 * 3600, '2 d 4 h'],
  [600, '10 min'],
])('formats %s seconds as %s', (seconds, expected) =>
  expect(formatDuration(Number(seconds))).toBe(expected),
);
it('formats dates in UTC', () =>
  expect(formatUtc('2026-12-01T01:00:00+01:00')).toBe('1 Dec 2026, 00:00 UTC'));

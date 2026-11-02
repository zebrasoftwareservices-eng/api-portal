// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProblemAlert } from './problem-alert';
afterEach(() => vi.useRealTimers());
it('honors Retry-After and enables retry only when the countdown ends', async () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  render(
    <ProblemAlert
      problem={{
        type: '/gateway-unavailable',
        title: 'Gateway unavailable',
        status: 503,
      }}
      onRetry={retry}
      retryAfterSeconds={2}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Try again in 2s' }),
  ).toBeDisabled();
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(
    screen.getByRole('button', { name: 'Try again in 1s' }),
  ).toBeDisabled();
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
});

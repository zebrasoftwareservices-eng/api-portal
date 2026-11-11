// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CopyButton, PageHeader } from '@portal/ui';
it('JSO-214 omits an empty breadcrumb landmark', () => {
  render(<PageHeader title="APIs" breadcrumb={[]} />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
it('JSO-215 announces header-copy success and a persistent manual-copy failure', async () => {
  const user = userEvent.setup();
  const write = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('Clipboard denied'));
  const manual = vi.fn();
  render(
    <CopyButton
      value="apikey: secret"
      ariaLabel="Copy header line"
      announce="Header line copied."
      failedMessage="Select the header line and press Ctrl+C."
      onFailed={manual}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Copy header line' }));
  expect(screen.getByText('Header line copied.')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  await user.click(screen.getByRole('button', { name: 'Copy header line' }));
  await waitFor(() => expect(manual).toHaveBeenCalledOnce());
  expect(
    screen.getByText('Select the header line and press Ctrl+C.'),
  ).toBeVisible();
  expect(screen.queryByText('Header line copied.')).not.toBeInTheDocument();
  expect(write).toHaveBeenCalledWith('apikey: secret');
});

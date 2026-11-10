// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyRevealDialog } from './key-reveal-dialog';
import type { IssuedCredential } from '../lib/types';
const credential: IssuedCredential = {
  id: 'key-1',
  kind: 'api-key',
  keyHint: 'test',
  status: 'active',
  createdAt: '2026-11-02T00:00:00Z',
  key: 'pk_secret_test',
  headerName: 'apikey',
};
describe('one-time key handover', () => {
  it('traps focus, ignores Escape and backdrop, copies the exact key and removes it on acknowledgment', async () => {
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue();
    function Flow() {
      const [open, setOpen] = useState(true);
      return open ? (
        <KeyRevealDialog
          open
          credential={credential}
          appName="Weather bot"
          apiTitles={['Sample HTTP API']}
          variant="first"
          onDone={() => setOpen(false)}
        />
      ) : (
        <p>Saved</p>
      );
    }
    const { container } = render(<Flow />);
    expect(
      await screen.findByRole('alertdialog', { name: 'Your API key' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy' })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText('API key')).toHaveValue(credential.key);
    fireEvent.pointerDown(document.querySelector('.overlay')!);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(write).toHaveBeenCalledWith(credential.key);
    expect(
      screen.getByRole('button', { name: '✓ Copied' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "I've saved it" }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(credential.key);
    expect(persist).not.toHaveBeenCalled();
  });
  it('selects the key for manual copying when clipboard access fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('blocked'),
    );
    render(
      <KeyRevealDialog
        open
        credential={credential}
        appName="App"
        apiTitles={[]}
        variant="additional"
        onDone={() => {}}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't copy automatically",
    );
    const field = screen.getByLabelText('API key') as HTMLTextAreaElement;
    expect(field.selectionEnd - field.selectionStart).toBe(
      credential.key.length,
    );
  });
});

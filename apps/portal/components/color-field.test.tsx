// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ColorField } from './color-field';
import { HEX_ERROR } from '../lib/theme';

describe('ColorField', () => {
  it('keeps the last valid colour until a complete hex is entered', async () => {
    const onChange = vi.fn();
    const onInvalid = vi.fn();
    const actor = userEvent.setup();
    render(
      <ColorField
        id="theme-color-light-primary"
        label="Primary"
        hint="Buttons"
        value="#1d4ed8"
        onChange={onChange}
        onInvalid={onInvalid}
      />,
    );
    const input = screen.getByLabelText('Primary');
    await actor.clear(input);
    await actor.type(input, '#fff');
    expect(onChange).not.toHaveBeenCalled();
    await actor.tab();
    expect(onChange).toHaveBeenCalledWith('#ffffff');
    expect(onInvalid).toHaveBeenCalledWith(undefined);
  });

  it('reports an invalid colour on blur without changing the draft', async () => {
    const onChange = vi.fn();
    const onInvalid = vi.fn();
    const actor = userEvent.setup();
    render(
      <ColorField
        id="theme-color-light-primary"
        label="Primary"
        hint="Buttons"
        value="#1d4ed8"
        onChange={onChange}
        onInvalid={onInvalid}
      />,
    );
    const input = screen.getByLabelText('Primary');
    await actor.clear(input);
    await actor.type(input, 'nope');
    await actor.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith(HEX_ERROR);
    expect(screen.getByText(`⚠ ${HEX_ERROR}`)).toBeInTheDocument();
  });
});

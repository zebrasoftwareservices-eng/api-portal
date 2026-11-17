// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, cloneTheme, type ThemeSettings } from '../lib/theme';
import { ThemeEditor } from './theme-editor';

const api = vi.hoisted(() => ({
  getThemeSettings: vi.fn(),
  saveTheme: vi.fn(),
  resetTheme: vi.fn(),
  exportTheme: vi.fn(),
  importTheme: vi.fn(),
}));
vi.mock('../lib/theme-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/theme-api')>('../lib/theme-api');
  return {
    ...actual,
    getThemeSettings: api.getThemeSettings,
    saveTheme: api.saveTheme,
    resetTheme: api.resetTheme,
    exportTheme: api.exportTheme,
    importTheme: api.importTheme,
    fileToData: vi.fn(async () => 'aGVsbG8='),
  };
});

function settings(patch: Partial<ThemeSettings> = {}): ThemeSettings {
  return {
    isDefault: true,
    etag: 'etag-1',
    values: cloneTheme(DEFAULT_THEME),
    defaults: cloneTheme(DEFAULT_THEME),
    logo: null,
    favicon: null,
    updatedAt: null,
    ...patch,
  };
}

beforeEach(() => {
  api.getThemeSettings.mockReset();
  api.saveTheme.mockReset();
  api.resetTheme.mockReset();
  api.exportTheme.mockReset();
  api.importTheme.mockReset();
  api.getThemeSettings.mockResolvedValue({ data: settings() });
  api.saveTheme.mockResolvedValue({ data: settings({ isDefault: false, etag: 'etag-2' }) });
  api.resetTheme.mockResolvedValue({ data: settings({ etag: 'etag-3' }) });
});

describe('ThemeEditor', () => {
  it('loads the default theme and keeps Save disabled until a field changes', async () => {
    const actor = userEvent.setup();
    render(<ThemeEditor />);
    expect(await screen.findByText('Default theme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeDisabled();
    expect(screen.getByTitle('Preview of the public portal with your unsaved theme')).toHaveAttribute(
      'src',
      '/?themePreview=1',
    );
    await actor.selectOptions(screen.getByLabelText('Font'), 'Inter');
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeEnabled();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
  });

  it('shows a contrast warning and still saves', async () => {
    const actor = userEvent.setup();
    render(<ThemeEditor />);
    await screen.findByText('Default theme');
    const text = screen.getByLabelText('Text');
    await actor.clear(text);
    await actor.type(text, '#ffffff');
    expect(await screen.findByText(/Low contrast/)).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(api.saveTheme).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          colors: expect.objectContaining({
            light: expect.objectContaining({ foreground: '#ffffff' }),
          }),
        }),
      }),
    );
    expect(await screen.findByText(/Theme saved/)).toBeInTheDocument();
  });

  it('maps a 400 pointer onto the named colour field', async () => {
    api.saveTheme.mockResolvedValue({
      error: {
        status: 400,
        errors: [{ pointer: '/values/colors/light/primary', message: 'Enter a six-digit hex colour, like #1d4ed8.' }],
      },
    });
    const actor = userEvent.setup();
    render(<ThemeEditor />);
    await screen.findByText('Default theme');
    await actor.selectOptions(screen.getByLabelText('Font'), 'Inter');
    await actor.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(await screen.findByRole('heading', { name: "The theme wasn't saved" })).toBeInTheDocument();
    expect(screen.getByLabelText('Primary')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText(/Enter a six-digit hex colour/).length).toBeGreaterThan(0);
  });

  it('asks before reset and calls delete', async () => {
    api.getThemeSettings.mockResolvedValue({ data: settings({ isDefault: false }) });
    const actor = userEvent.setup();
    render(<ThemeEditor />);
    await screen.findByText('Custom theme');
    await actor.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Reset the theme to the default?' })).toBeInTheDocument();
    await actor.click(within(dialog).getByRole('button', { name: 'Reset to default' }));
    expect(api.resetTheme).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Theme reset to the default/)).toBeInTheDocument();
  });

  it('rejects a file that is not a portal theme export', async () => {
    render(<ThemeEditor />);
    await screen.findByText('Default theme');
    const file = new File(['{"format":"nope"}'], 'theme.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import'), { target: { files: [file] } });
    expect(await screen.findByText(/isn't a portal theme export/)).toBeInTheDocument();
    expect(api.importTheme).not.toHaveBeenCalled();
  });

  it('rejects an oversized logo before save', async () => {
    const actor = userEvent.setup();
    render(<ThemeEditor />);
    await screen.findByText('Default theme');
    const file = new File([new Uint8Array(513 * 1024)], 'logo.png', { type: 'image/png' });
    await actor.upload(screen.getByLabelText('Logo'), file);
    expect(await screen.findByText(/the limit is 512 KB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeDisabled();
  });

  it('shows the admin-only message when the server returns 403', async () => {
    api.getThemeSettings.mockResolvedValue({ error: { status: 403 } });
    render(<ThemeEditor />);
    expect(await screen.findByText('Only portal admins can change the theme.')).toBeInTheDocument();
  });
});

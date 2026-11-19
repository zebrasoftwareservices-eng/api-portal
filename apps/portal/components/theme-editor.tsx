// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { AlertDialog, Badge, Button, Card, Input, Label, SelectField, Textarea } from '@portal/ui';
import { AssetField } from './asset-field';
import { ColorField } from './color-field';
import {
  errorDetail,
  exportTheme,
  fileToData,
  readFileText,
  getThemeSettings,
  importTheme,
  resetTheme,
  saveTheme,
  type ThemeExportFile,
  type ThemeFailure,
  type ThemeFieldError,
} from '../lib/theme-api';
import {
  COLOR_FIELDS,
  CSS_LIMIT,
  DEFAULT_THEME,
  FONT_IDS,
  FONT_LABELS,
  FONTS,
  IMPORT_LIMIT,
  assetContentType,
  cloneTheme,
  contrastWarnings,
  customCssProblem,
  fieldTarget,
  formatRatio,
  portalAssetUrl,
  renderThemeCss,
  themeValuesEqual,
  type PreviewMode,
  type ThemeColors,
  type ThemeFont,
  type ThemeSettings,
  type ThemeValues,
} from '../lib/theme';

type Notice = 'none' | 'saved' | 'reset' | 'imported';
type Pending = File | null | 'remove';
type Pane = 'edit' | 'preview';

function normalizeSettings(data: ThemeSettings): ThemeSettings {
  const asset = (value: ThemeSettings['logo']) =>
    value ? { ...value, url: portalAssetUrl(value.url) || value.url } : null;
  return {
    ...data,
    values: data.values || cloneTheme(DEFAULT_THEME),
    defaults: data.defaults || cloneTheme(DEFAULT_THEME),
    logo: asset(data.logo),
    favicon: asset(data.favicon),
  };
}

function downloadJson(value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'portal-theme.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function savedLabel(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ThemeEditor() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'forbidden' | 'signed-out'>('loading');
  const [settings, setSettings] = useState<ThemeSettings | null>(null);
  const [draft, setDraft] = useState<ThemeValues>(cloneTheme(DEFAULT_THEME));
  const [baseline, setBaseline] = useState<ThemeValues>(cloneTheme(DEFAULT_THEME));
  const [pendingLogo, setPendingLogo] = useState<Pending>(null);
  const [pendingFavicon, setPendingFavicon] = useState<Pending>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<PreviewMode>('light');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('light');
  const [pane, setPane] = useState<Pane>('edit');
  const [busy, setBusy] = useState<'save' | 'reset' | 'import' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice>('none');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formAlert, setFormAlert] = useState<{ title: string; lines: { text: string; pointer?: string }[] } | null>(null);
  const [headerAlert, setHeaderAlert] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<{ name: string; body: ThemeExportFile } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLines, setImportLines] = useState<string[]>([]);
  const [frameKey, setFrameKey] = useState(0);
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'unavailable' | 'left'>('loading');
  const [radiusText, setRadiusText] = useState('8');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLHeadingElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const importCancelRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const payload = useRef({ css: '', logo: null as string | null, mode: 'light' as PreviewMode });
  const cssHint = useId();

  function apply(next: ThemeSettings, kind: Notice) {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    setDraft(cloneTheme(normalized.values));
    setBaseline(cloneTheme(normalized.values));
    setRadiusText(String(normalized.values.radius));
    setPendingLogo(null);
    setPendingFavicon(null);
    setClientErrors({});
    setServerErrors({});
    setFormAlert(null);
    setSessionEnded(false);
    setNotice(kind);
    setPhase('ready');
  }

  async function load() {
    setPhase('loading');
    setHeaderAlert(null);
    const result = await getThemeSettings();
    if (result.data) {
      apply(result.data, 'none');
      return;
    }
    if (result.error?.status === 403) setPhase('forbidden');
    else if (result.error?.status === 401) setPhase('signed-out');
    else setPhase('error');
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!(pendingLogo instanceof File)) {
      setLogoUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogo);
    setLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingLogo]);

  const dirty = !themeValuesEqual(draft, baseline) || pendingLogo !== null || pendingFavicon !== null;
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const [debounced, setDebounced] = useState(draft);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draft), 150);
    return () => clearTimeout(timer);
  }, [draft]);
  const warnings = {
    light: contrastWarnings(debounced.colors.light),
    dark: contrastWarnings(debounced.colors.dark),
  };
  const cssError = customCssProblem(draft.customCss);
  useEffect(() => {
    setClientErrors((current) => {
      const next = { ...current };
      if (cssError) next.customCss = cssError;
      else delete next.customCss;
      return next;
    });
  }, [cssError]);

  const previewLogo =
    pendingLogo instanceof File ? logoUrl : pendingLogo === 'remove' ? null : settings?.logo?.url || null;
  payload.current = {
    css: renderThemeCss(draft) + draft.customCss,
    logo: previewLogo,
    mode: previewMode,
  };

  function postNow() {
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    const current = payload.current;
    frame.postMessage(
      { type: 'portal-theme-preview', css: current.css, logo: current.logo, mode: current.mode },
      window.location.origin,
    );
  }

  useEffect(() => {
    if (frameState !== 'ready') return;
    const timer = setTimeout(postNow, 150);
    return () => clearTimeout(timer);
  }, [draft, previewLogo, previewMode, frameState]);

  useEffect(() => {
    if (phase !== 'ready') return;
    setFrameState('loading');
    const timer = setTimeout(() => {
      setFrameState((state) => (state === 'loading' ? 'unavailable' : state));
    }, 10000);
    return () => clearTimeout(timer);
  }, [frameKey, phase]);

  function update(next: ThemeValues) {
    setDraft(next);
    setNotice('none');
    setFormAlert(null);
  }
  function patchColor(mode: PreviewMode, key: keyof ThemeColors, value: string) {
    setServerErrors((current) => {
      const next = { ...current };
      delete next[`${mode}.${key}`];
      return next;
    });
    update({
      ...draft,
      colors: { ...draft.colors, [mode]: { ...draft.colors[mode], [key]: value } },
    });
  }
  function setClientError(key: string, message: string | undefined) {
    setClientErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  const clientCount = Object.keys(clientErrors).length;
  const saving = busy === 'save';
  const resetDisabled = Boolean(settings?.isDefault) && !dirty;

  async function onSave() {
    if (!dirty || saving || clientCount) return;
    setBusy('save');
    setFormAlert(null);
    setSessionEnded(false);
    try {
      const body: { values: ThemeValues; logo?: { contentType: string; data: string } | null; favicon?: { contentType: string; data: string } | null } = {
        values: draft,
      };
      if (pendingLogo instanceof File) {
        body.logo = { contentType: assetContentType('logo', pendingLogo) || 'image/png', data: await fileToData(pendingLogo) };
      } else if (pendingLogo === 'remove') body.logo = null;
      if (pendingFavicon instanceof File) {
        body.favicon = {
          contentType: assetContentType('favicon', pendingFavicon) || 'image/png',
          data: await fileToData(pendingFavicon),
        };
      } else if (pendingFavicon === 'remove') body.favicon = null;
      const result = await saveTheme(body);
      if (result.data) {
        apply(result.data, 'saved');
        saveRef.current?.focus();
        return;
      }
      showSaveFailure(result.error);
    } finally {
      setBusy(null);
    }
  }

  function showSaveFailure(error: ThemeFailure | undefined) {
    if (error?.status === 401) {
      setSessionEnded(true);
      return;
    }
    if (error?.status === 413) {
      setFormAlert({
        title: "The theme wasn't saved",
        lines: [{ text: 'The theme is too large to save (over 2 MB). Use smaller logo and favicon files.' }],
      });
    } else if (error?.status === 400) {
      const lines = (error.errors?.length ? error.errors : [{ message: error.detail || 'Check the theme and try again.' }]).map(
        (item: ThemeFieldError) => ({
          text: errorDetail(item, error.detail || 'Check the theme and try again.'),
          pointer: item.pointer,
        }),
      );
      const mapped: Record<string, string> = {};
      for (const line of lines) {
        if (!line.pointer) continue;
        const target = fieldTarget(line.pointer);
        if (!target) continue;
        const key = target.mode ? `${target.mode}.${target.id.split('-').pop()}` : target.id.replace('theme-', '');
        if (target.id.startsWith('theme-color-') && target.mode) {
          mapped[`${target.mode}.${target.id.slice(`theme-color-${target.mode}-`.length)}`] = line.text;
        } else if (target.id === 'theme-logo') mapped.logo = line.text;
        else if (target.id === 'theme-favicon') mapped.favicon = line.text;
        else if (target.id === 'theme-custom-css') mapped.customCss = line.text;
        else if (target.id === 'theme-font') mapped.font = line.text;
        else if (target.id === 'theme-radius') mapped.radius = line.text;
        else if (target.id === 'theme-default-mode') mapped.defaultMode = line.text;
        else mapped[key] = line.text;
      }
      setServerErrors(mapped);
      setFormAlert({ title: "The theme wasn't saved", lines });
    } else {
      setFormAlert({
        title: "The theme wasn't saved",
        lines: [{ text: "The theme wasn't saved because the portal server didn't respond. Your changes are still here; try again." }],
      });
    }
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  function focusPointer(pointer?: string) {
    if (!pointer) return;
    const target = fieldTarget(pointer);
    if (!target) return;
    if (target.mode) {
      setColorMode(target.mode);
      setPreviewMode(target.mode);
    }
    setPane('edit');
    requestAnimationFrame(() => document.getElementById(target.id)?.focus());
  }

  async function onExport() {
    setBusy('export');
    setHeaderAlert(null);
    try {
      const result = await exportTheme();
      if (!result.data) {
        setHeaderAlert("The theme couldn't be exported. Try again.");
        return;
      }
      downloadJson(result.data);
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    setBusy('reset');
    setResetError(null);
    try {
      const result = await resetTheme();
      if (!result.data) {
        if (result.error?.status === 401) {
          setResetOpen(false);
          setSessionEnded(true);
          return;
        }
        setResetError("The theme wasn't reset because the portal server didn't respond. Try again.");
        return;
      }
      apply(result.data, 'reset');
      setResetOpen(false);
    } finally {
      setBusy(null);
    }
  }

  async function onImport() {
    if (!importFile) return;
    setBusy('import');
    setImportError(null);
    setImportLines([]);
    try {
      const result = await importTheme(importFile.body);
      if (result.data) {
        apply(result.data, 'imported');
        setImportFile(null);
        return;
      }
      if (result.error?.status === 401) {
        setImportFile(null);
        setSessionEnded(true);
        return;
      }
      const lines = (result.error?.errors || []).map((item) => errorDetail(item, result.error?.detail || 'Check the file and try again.'));
      setImportError("The theme wasn't imported.");
      setImportLines(lines.length ? lines : [result.error?.detail || 'Nothing changed.']);
    } finally {
      setBusy(null);
    }
  }

  async function onImportPick(file: File | undefined) {
    if (!file) return;
    setHeaderAlert(null);
    if (file.size > IMPORT_LIMIT) {
      setHeaderAlert('The file is too large to import (over 2 MB).');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFileText(file));
    } catch {
      setHeaderAlert(`${file.name} isn't a valid JSON file. Choose a file exported from a portal's Theme page.`);
      return;
    }
    const body = parsed as ThemeExportFile;
    if (!body || typeof body !== 'object' || body.format !== 'portal-theme' || body.version !== 1) {
      setHeaderAlert("This file isn't a portal theme export (or it's from a newer version). Choose a file exported from a portal's Theme page.");
      return;
    }
    setImportError(null);
    setImportLines([]);
    setImportFile({ name: file.name, body });
  }

  function focusClientError() {
    const key = Object.keys(clientErrors)[0];
    if (!key) return;
    if (key.startsWith('light.') || key.startsWith('dark.')) {
      const [mode, field] = key.split('.') as [PreviewMode, string];
      setColorMode(mode);
      setPreviewMode(mode);
      requestAnimationFrame(() => document.getElementById(`theme-color-${mode}-${field}`)?.focus());
      return;
    }
    const ids: Record<string, string> = {
      logo: 'theme-logo',
      favicon: 'theme-favicon',
      customCss: 'theme-custom-css',
      font: 'theme-font',
      radius: 'theme-radius',
      defaultMode: 'theme-default-mode',
    };
    document.getElementById(ids[key] || '')?.focus();
  }

  function focusWarning() {
    const current = warnings[colorMode];
    const otherMode = colorMode === 'light' ? 'dark' : 'light';
    const warning = current[0] || warnings[otherMode][0];
    if (!warning) return;
    const mode = current[0] ? colorMode : otherMode;
    setColorMode(mode);
    setPreviewMode(mode);
    requestAnimationFrame(() =>
      document.getElementById(`theme-warning-${mode}-${warning.under}-${warning.surface}`)?.focus(),
    );
  }

  if (phase === 'loading') {
    return (
      <section className="theme-editor" aria-busy="true">
        <div className="theme-heading">
          <h1>Theme</h1>
          <span className="skeleton theme-badge-skeleton" />
        </div>
        <div className="theme-columns">
          <div className="theme-form stack">
            {['Logo and favicon', 'Colours', 'Font and shape', 'Custom CSS'].map((title) => (
              <div key={title} className="card skeleton theme-skeleton" aria-hidden="true">
                {title}
              </div>
            ))}
          </div>
          <div className="theme-preview-skeleton">Loading preview…</div>
        </div>
        <div className="theme-bar">
          <span />
          <Button type="button" disabled>
            Save theme
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'signed-out') {
    return (
      <section className="card stack">
        <h1>Theme</h1>
        <div className="alert error stack" role="alert">
          <p>Your session ended. Sign in again in a new tab, then select Save theme. Your changes are still here.</p>
          <a className="button secondary" href="/sign-in" target="_blank" rel="noreferrer">
            Sign in
          </a>
        </div>
      </section>
    );
  }

  if (phase === 'forbidden') {
    return (
      <section className="card stack">
        <h1 tabIndex={-1}>Theme</h1>
        <p>Only portal admins can change the theme.</p>
        <a className="button" href="/">
          Back to the portal
        </a>
      </section>
    );
  }

  if (phase === 'error' || !settings) {
    return (
      <section className="theme-editor">
        <h1>Theme</h1>
        <div className="alert error stack" role="alert">
          <h2>Couldn't load the theme</h2>
          <p>The portal server didn't respond. The live portal keeps its current theme.</p>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const warningCount = warnings.light.length + warnings.dark.length;
  const colors = draft.colors[colorMode];
  const modeWarnings = warnings[colorMode];
  const exported = importFile?.body.exportedAt ? savedLabel(importFile.body.exportedAt) : null;
  const nearCssLimit = draft.customCss.length >= CSS_LIMIT * 0.9;

  return (
    <section className="theme-editor">
      <div className="theme-heading">
        <div>
          <div className="theme-title">
            <h1>Theme</h1>
            <Badge className={settings.isDefault ? '' : 'outline'}>{settings.isDefault ? 'Default theme' : 'Custom theme'}</Badge>
          </div>
          {settings.updatedAt && (
            <p className="hint">
              Last saved <time dateTime={settings.updatedAt}>{savedLabel(settings.updatedAt)}</time>
            </p>
          )}
          <p>Brand the public portal and developer pages. The admin area always uses the built-in look, so you can fix a theme here whatever it does.</p>
        </div>
        <div className="theme-heading-actions">
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => importInputRef.current?.click()}>
            Import
          </Button>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void onExport()}>
            {busy === 'export' ? 'Exporting…' : 'Export'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resetDisabled || Boolean(busy)}
            aria-describedby={resetDisabled ? 'theme-reset-hint' : undefined}
            onClick={() => {
              setResetError(null);
              setResetOpen(true);
            }}
          >
            Reset to default
          </Button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Import"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              const file = picked
                ? new File([picked], picked.name, { type: picked.type, lastModified: picked.lastModified })
                : undefined;
              event.target.value = '';
              void onImportPick(file);
            }}
          />
          {resetDisabled && (
            <span className="hint" id="theme-reset-hint">
              Already the default theme
            </span>
          )}
          {dirty && <p className="hint">Export downloads the saved theme. Save first to include your changes.</p>}
        </div>
      </div>
      {headerAlert && (
        <div className="alert error" role="alert">
          {headerAlert}
        </div>
      )}
      {sessionEnded && (
        <div className="alert error stack" role="alert">
          <p>Your session ended. Sign in again in a new tab, then select Save theme. Your changes are still here.</p>
          <a className="button secondary" href="/sign-in" target="_blank" rel="noreferrer">
            Sign in
          </a>
        </div>
      )}
      <div className="theme-switch" role="tablist" aria-label="Editor section">
        <button type="button" role="tab" aria-selected={pane === 'edit'} onClick={() => setPane('edit')}>
          Edit
        </button>
        <button type="button" role="tab" aria-selected={pane === 'preview'} onClick={() => setPane('preview')}>
          Preview
        </button>
      </div>
      <div className="theme-columns">
        <div className="theme-form stack" hidden={pane !== 'edit'}>
          {formAlert && (
            <div className="alert error stack" role="alert">
              <h2 tabIndex={-1} ref={alertRef}>
                {formAlert.title}
              </h2>
              <ul>
                {formAlert.lines.map((line) => (
                  <li key={line.text}>
                    {line.pointer ? (
                      <button type="button" className="button link" onClick={() => focusPointer(line.pointer)}>
                        {line.text}
                      </button>
                    ) : (
                      line.text
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Card className="stack">
            <h2>Logo and favicon</h2>
            <AssetField
              kind="logo"
              current={settings.logo}
              pending={pendingLogo}
              disabled={saving}
              error={serverErrors.logo || clientErrors.logo}
              onPick={(file) => {
                setPendingLogo(file);
                setClientError('logo', undefined);
                setServerErrors((current) => {
                  const next = { ...current };
                  delete next.logo;
                  return next;
                });
                setNotice('none');
              }}
              onReject={(message) => setClientError('logo', message)}
              onRemove={() => {
                setPendingLogo(settings.logo ? 'remove' : null);
                setClientError('logo', undefined);
                setNotice('none');
              }}
            />
            <AssetField
              kind="favicon"
              current={settings.favicon}
              pending={pendingFavicon}
              disabled={saving}
              error={serverErrors.favicon || clientErrors.favicon}
              onPick={(file) => {
                setPendingFavicon(file);
                setClientError('favicon', undefined);
                setNotice('none');
              }}
              onReject={(message) => setClientError('favicon', message)}
              onRemove={() => {
                setPendingFavicon(settings.favicon ? 'remove' : null);
                setClientError('favicon', undefined);
                setNotice('none');
              }}
            />
          </Card>
          <Card className="stack">
            <div className="theme-card-title">
              <h2>Colours</h2>
              <div className="theme-tabs" role="tablist" aria-label="Colour mode">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={colorMode === mode}
                    onClick={() => {
                      setColorMode(mode);
                      setPreviewMode(mode);
                    }}
                  >
                    {mode === 'light' ? 'Light' : 'Dark'}
                    {warnings[mode].length > 0 && colorMode !== mode
                      ? ` (${warnings[mode].length} warning${warnings[mode].length === 1 ? '' : 's'})`
                      : ''}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="link"
                disabled={saving}
                onClick={() => {
                  update({
                    ...draft,
                    colors: { ...draft.colors, [colorMode]: cloneTheme(settings.defaults).colors[colorMode] },
                  });
                }}
              >
                Reset colours
              </Button>
            </div>
            {COLOR_FIELDS.map((field) => (
              <ColorField
                key={`${colorMode}.${field.key}`}
                id={`theme-color-${colorMode}-${field.key}`}
                label={field.label}
                hint={field.hint}
                value={colors[field.key]}
                disabled={saving}
                error={serverErrors[`${colorMode}.${field.key}`]}
                onChange={(value) => patchColor(colorMode, field.key, value)}
                onInvalid={(message) => setClientError(`${colorMode}.${field.key}`, message)}
                warning={modeWarnings
                  .filter((warning) => warning.under === field.key)
                  .map((warning) => (
                    <div
                      key={`${warning.text}-${warning.surface}`}
                      id={`theme-warning-${colorMode}-${warning.under}-${warning.surface}`}
                      className="alert warning"
                      tabIndex={-1}
                    >
                      ⚠ Low contrast: <strong>{formatRatio(warning.ratio)}:1</strong> between {warning.textLabel} and {warning.surfaceLabel}. Text needs at least 4.5:1.
                    </div>
                  ))}
              />
            ))}
          </Card>
          <Card className="stack">
            <h2>Font and shape</h2>
            <div className="field">
              <Label htmlFor="theme-font">Font</Label>
              <SelectField
                id="theme-font"
                value={draft.font}
                disabled={saving}
                aria-invalid={serverErrors.font ? true : undefined}
                onChange={(event) => update({ ...draft, font: event.target.value as ThemeFont })}
              >
                {FONT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {FONT_LABELS[id]}
                  </option>
                ))}
              </SelectField>
              <p className="theme-sample" style={{ fontFamily: FONTS[draft.font] }}>
                Get your API key and make your first call in minutes.
              </p>
              <p className="hint">Fonts are served by your portal. Visitors' browsers make no third-party requests.</p>
              {serverErrors.font && <span className="field-error">⚠ {serverErrors.font}</span>}
            </div>
            <div className="field">
              <Label id="theme-radius-label" htmlFor="theme-radius">
                Corner radius
              </Label>
              <div className="theme-radius">
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={draft.radius}
                  disabled={saving}
                  aria-labelledby="theme-radius-label"
                  aria-valuetext={`${draft.radius} pixels`}
                  onChange={(event) => {
                    const radius = Number(event.target.value);
                    setRadiusText(String(radius));
                    update({ ...draft, radius });
                  }}
                />
                <Input
                  id="theme-radius"
                  className="theme-radius-input"
                  inputMode="numeric"
                  value={radiusText}
                  disabled={saving}
                  aria-labelledby="theme-radius-label"
                  aria-invalid={serverErrors.radius ? true : undefined}
                  onChange={(event) => setRadiusText(event.target.value)}
                  onBlur={() => {
                    const parsed = Math.round(Number(radiusText));
                    const radius = Number.isFinite(parsed) ? Math.min(24, Math.max(0, parsed)) : draft.radius;
                    setRadiusText(String(radius));
                    update({ ...draft, radius });
                  }}
                />
                <span>px</span>
                <span className="theme-radius-sample" style={{ borderRadius: `${draft.radius}px` }} />
              </div>
              {serverErrors.radius && <span className="field-error">⚠ {serverErrors.radius}</span>}
            </div>
            <fieldset id="theme-default-mode" disabled={saving} aria-invalid={serverErrors.defaultMode ? true : undefined}>
              <legend>Default mode</legend>
              {(
                [
                  ['system', "Follow visitor's system setting"],
                  ['light', 'Always light'],
                  ['dark', 'Always dark'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="theme-radio">
                  <input
                    type="radio"
                    name="defaultMode"
                    value={value}
                    checked={draft.defaultMode === value}
                    onChange={() => update({ ...draft, defaultMode: value })}
                  />
                  {label}
                </label>
              ))}
              <p className="hint">Both palettes are saved either way.</p>
              {serverErrors.defaultMode && <span className="field-error">⚠ {serverErrors.defaultMode}</span>}
            </fieldset>
          </Card>
          <Card className="stack">
            <h2>Custom CSS</h2>
            <Label htmlFor="theme-custom-css">Custom CSS</Label>
            <Textarea
              id="theme-custom-css"
              className="theme-css"
              rows={12}
              spellCheck={false}
              autoCapitalize="off"
              wrap="off"
              disabled={saving}
              placeholder="/* Applied after the theme on public and developer pages */"
              aria-describedby={cssHint}
              aria-invalid={clientErrors.customCss || serverErrors.customCss ? true : undefined}
              value={draft.customCss}
              onChange={(event) => update({ ...draft, customCss: event.target.value })}
            />
            <p id={cssHint} className="hint">
              Applies to public and developer pages, never to the admin area. `@import` isn't allowed; use `url()` to load a web font.
            </p>
            <p className={draft.customCss.length > CSS_LIMIT ? 'field-error theme-count' : nearCssLimit ? 'theme-count theme-count-warn' : 'hint theme-count'}>
              {draft.customCss.length.toLocaleString('en-US')} / 65,536 characters
            </p>
            {(clientErrors.customCss || serverErrors.customCss) && (
              <span className="field-error">⚠ {clientErrors.customCss || serverErrors.customCss}</span>
            )}
          </Card>
        </div>
        <div className="theme-preview" hidden={pane !== 'preview'}>
          <div className="theme-preview-bar">
            <h2>Preview</h2>
            <p className="hint">Not live until you save</p>
            <div role="group" aria-label="Preview mode">
              {(['light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="button outline"
                  aria-pressed={previewMode === mode}
                  onClick={() => {
                    setPreviewMode(mode);
                    setColorMode(mode);
                  }}
                >
                  {mode === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" aria-label="Reload preview" onClick={() => setFrameKey((key) => key + 1)}>
              ↻
            </Button>
          </div>
          {frameState === 'left' && (
            <p className="hint">This page shows the live theme. Reload preview to see your changes.</p>
          )}
          {frameState === 'unavailable' ? (
            <div className="theme-preview-fallback">
              <p>Preview isn't available right now. You can still save; check the result on the public portal.</p>
              <Button type="button" variant="secondary" onClick={() => setFrameKey((key) => key + 1)}>
                Reload preview
              </Button>
            </div>
          ) : (
            <div className="theme-frame">
              {frameState === 'loading' && <p className="theme-preview-loading">Loading preview…</p>}
              <iframe
                key={frameKey}
                ref={frameRef}
                title="Preview of the public portal with your unsaved theme"
                src="/?themePreview=1"
                onLoad={() => {
                  try {
                    const href = frameRef.current?.contentWindow?.location.href;
                    if (href && new URL(href).searchParams.get('themePreview') !== '1') {
                      setFrameState('left');
                      return;
                    }
                  } catch {
                    setFrameState('unavailable');
                    return;
                  }
                  setFrameState('ready');
                  postNow();
                }}
              />
            </div>
          )}
        </div>
      </div>
      <div className="theme-bar">
        <div role="status" aria-live="polite">
          {saving ? (
            <span className="theme-status">
              <span className="spinner" aria-hidden="true" /> Saving…
            </span>
          ) : clientCount ? (
            <button type="button" className="button link" onClick={focusClientError}>
              Fix {clientCount} field{clientCount === 1 ? '' : 's'} to save
            </button>
          ) : notice === 'saved' ? (
            <span className="theme-status theme-ok">✓ Theme saved. Visitors see it on their next page load.</span>
          ) : notice === 'reset' ? (
            <span className="theme-status theme-ok">✓ Theme reset to the default.</span>
          ) : notice === 'imported' ? (
            <span className="theme-status theme-ok">✓ Theme imported and applied.</span>
          ) : dirty ? (
            <span>
              <span className="theme-dot" aria-hidden="true">
                ●
              </span>{' '}
              Unsaved changes
              {warningCount > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <button type="button" className="button link" onClick={focusWarning}>
                    {warningCount} contrast warning{warningCount === 1 ? '' : 's'}
                  </button>
                </>
              )}
            </span>
          ) : settings.isDefault ? null : (
            'All changes saved'
          )}
        </div>
        <div className="theme-bar-actions">
          {dirty && !saving && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(cloneTheme(baseline));
                setRadiusText(String(baseline.radius));
                setPendingLogo(null);
                setPendingFavicon(null);
                setClientErrors({});
                setServerErrors({});
                setFormAlert(null);
                setNotice('none');
              }}
            >
              Discard changes
            </Button>
          )}
          <Button ref={saveRef} type="button" disabled={!dirty || saving || clientCount > 0} onClick={() => void onSave()}>
            {saving ? (
              <span className="theme-status">
                <span className="spinner" aria-hidden="true" /> Saving…
              </span>
            ) : (
              'Save theme'
            )}
          </Button>
        </div>
      </div>
      <AlertDialog.Root open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              resetCancelRef.current?.focus();
            }}
          >
            <AlertDialog.Title asChild>
              <h2>Reset the theme to the default?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description>
              This removes your logo, favicon, colours, font, radius and custom CSS from the live portal right away. Export the theme first if you might want it back.
            </AlertDialog.Description>
            {resetError && (
              <div className="alert error" role="alert">
                {resetError}
              </div>
            )}
            <div className="row">
              <AlertDialog.Cancel asChild>
                <Button ref={resetCancelRef} type="button" variant="secondary" disabled={busy === 'reset'}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button type="button" variant="outline" disabled={busy === 'reset'} onClick={() => void onExport()}>
                Export first
              </Button>
              <Button type="button" variant="destructive" disabled={busy === 'reset'} onClick={() => void onReset()}>
                {busy === 'reset' ? (
                  <span className="theme-status">
                    <span className="spinner" aria-hidden="true" /> Resetting…
                  </span>
                ) : (
                  'Reset to default'
                )}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={Boolean(importFile)} onOpenChange={(open) => !open && busy !== 'import' && setImportFile(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              importCancelRef.current?.focus();
            }}
          >
            <AlertDialog.Title asChild>
              <h2>Import {importFile?.name}?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description>
              This replaces the live theme right away, including the logo and favicon.
              {dirty ? ' Your unsaved changes here will be lost.' : ''}
            </AlertDialog.Description>
            {exported && <p className="hint">Exported {exported}</p>}
            {importError && (
              <div className="alert error" role="alert">
                <p>{importError}</p>
                {importLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p>Nothing changed.</p>
              </div>
            )}
            <div className="row">
              <AlertDialog.Cancel asChild>
                <Button ref={importCancelRef} type="button" variant="secondary" disabled={busy === 'import'}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button type="button" disabled={busy === 'import'} onClick={() => void onImport()}>
                {busy === 'import' ? 'Importing…' : 'Import and apply'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}

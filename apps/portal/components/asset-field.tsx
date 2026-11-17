// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useId, useState } from 'react';
import { Button } from '@portal/ui';
import { assetProblem, formatBytes, portalAssetUrl, type ThemeAssetInfo } from '../lib/theme';
export function AssetField({
  kind,
  current,
  pending,
  onPick,
  onReject,
  onRemove,
  error,
  disabled,
}: {
  kind: 'logo' | 'favicon';
  current: ThemeAssetInfo | null;
  pending: File | null | 'remove';
  onPick: (file: File) => void;
  onReject: (message: string) => void;
  onRemove: () => void;
  error?: string;
  disabled?: boolean;
}) {
  const inputId = kind === 'logo' ? 'theme-logo' : 'theme-favicon';
  const hintId = useId();
  const errorId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!(pending instanceof File)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);
  const removed = pending === 'remove';
  const file = pending instanceof File ? pending : null;
  const custom = !removed && (file || current);
  const src = file ? preview : !removed && current ? portalAssetUrl(current.url) : null;
  const name = file ? file.name : current && !removed ? kind : null;
  const size = file ? file.size : current && !removed ? current.byteSize : null;
  const noun = kind === 'logo' ? 'logo' : 'favicon';
  return (
    <div className="theme-asset">
      <span id={`${inputId}-label`}>{kind === 'logo' ? 'Logo' : 'Favicon'}</span>
      <div className="theme-asset-row">
        <span className={`theme-thumb ${kind}`} aria-hidden="true">
          {src ? <img src={src} alt="" /> : null}
        </span>
        <span className="theme-asset-meta">
          <span>{name || 'Built-in'}</span>
          {size !== null && <span className="hint">{formatBytes(size)}</span>}
          {file || removed ? <span className="hint">Not saved yet</span> : null}
        </span>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => document.getElementById(inputId)?.click()}>
          {custom ? `Replace ${noun}` : `Upload ${noun}`}
        </Button>
        {custom && (
          <Button type="button" variant="ghost" disabled={disabled} onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={kind === 'logo' ? 'image/png,image/svg+xml,image/webp' : 'image/png,image/svg+xml,image/x-icon,.ico'}
        aria-labelledby={`${inputId}-label`}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          const file = picked
            ? new File([picked], picked.name, { type: picked.type, lastModified: picked.lastModified })
            : undefined;
          event.target.value = '';
          if (!file) return;
          const problem = assetProblem(kind, file);
          if (problem) {
            onReject(problem);
            return;
          }
          onPick(file);
        }}
      />
      <span className="hint" id={hintId}>
        {kind === 'logo'
          ? 'PNG, SVG or WebP, up to 512 KB. Shown in the header at up to 40px tall.'
          : 'PNG, SVG or ICO, up to 128 KB. Square works best.'}
      </span>
      {error && (
        <span className="field-error" id={errorId}>
          ⚠ {error}
        </span>
      )}
    </div>
  );
}

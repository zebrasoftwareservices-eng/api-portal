// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Input, Label } from '@portal/ui';
import { HEX_ERROR, normalizeHex } from '../lib/theme';
export function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  onInvalid,
  error,
  warning,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onInvalid?: (message: string | undefined) => void;
  error?: string;
  warning?: ReactNode;
  disabled?: boolean;
}) {
  const hintId = useId();
  const errorId = useId();
  const warningId = useId();
  const [text, setText] = useState(value);
  const [localError, setLocalError] = useState<string>();
  useEffect(() => {
    setText(value);
    setLocalError(undefined);
  }, [value]);
  const shown = error || localError;
  const hasWarning = Array.isArray(warning) ? warning.length > 0 : Boolean(warning);
  const described = [hintId, shown ? errorId : '', hasWarning ? warningId : ''].filter(Boolean).join(' ') || undefined;
  function commit(next: string) {
    const normal = normalizeHex(next);
    if (!normal) {
      setLocalError(HEX_ERROR);
      onInvalid?.(HEX_ERROR);
      return;
    }
    setText(normal);
    setLocalError(undefined);
    onInvalid?.(undefined);
    if (normal !== value) onChange(normal);
  }
  return (
    <div className="theme-color">
      <Label htmlFor={id}>{label}</Label>
      <div className="theme-color-controls">
        <input
          className="theme-swatch"
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          aria-label={`${label} colour picker`}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            setLocalError(undefined);
            onInvalid?.(undefined);
            onChange(event.target.value);
          }}
        />
        <Input
          id={id}
          className="mono theme-hex"
          value={text}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          disabled={disabled}
          aria-invalid={shown ? true : undefined}
          aria-describedby={described}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const trimmed = next.trim();
            const normal = normalizeHex(trimmed);
            const complete = trimmed.replace(/^#/, '').length === 6;
            if (normal && complete) {
              setLocalError(undefined);
              onInvalid?.(undefined);
              if (normal !== value) onChange(normal);
            }
          }}
          onBlur={() => commit(text)}
        />
      </div>
      <span className="hint" id={hintId}>
        {hint}
      </span>
      {shown && (
        <span className="field-error" id={errorId}>
          ⚠ {shown}
        </span>
      )}
      {hasWarning && <div id={warningId}>{warning}</div>}
    </div>
  );
}

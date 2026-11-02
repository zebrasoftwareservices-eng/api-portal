// SPDX-License-Identifier: Apache-2.0
'use client';
import { useId, type ReactNode } from 'react';
export function Field({
  label,
  error,
  hint,
  children,
  id,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
  id?: string;
}) {
  const generated = useId();
  const fieldId = id || generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {children({
        id: fieldId,
        'aria-invalid': !!error,
        'aria-describedby': error
          ? `${fieldId}-error`
          : hint
            ? `${fieldId}-hint`
            : undefined,
      })}
      {hint && (
        <span className="hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${fieldId}-error`}>
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
export function focusInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() =>
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}

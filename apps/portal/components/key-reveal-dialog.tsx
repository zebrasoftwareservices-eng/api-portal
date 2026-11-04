// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRef, useState } from 'react';
import { AlertDialog, Button, CopyButton } from '@portal/ui';
import type { IssuedCredential } from '../lib/types';
export function KeyRevealDialog({
  open,
  credential,
  appName,
  apiTitles,
  variant,
  onDone,
}: {
  open: boolean;
  credential: IssuedCredential;
  appName: string;
  apiTitles: string[];
  variant: 'first' | 'additional';
  onDone: () => void;
}) {
  const copy = useRef<HTMLDivElement>(null);
  const key = useRef<HTMLTextAreaElement>(null);
  const [manual, setManual] = useState(false);
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content
          className="dialog stack"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            copy.current?.querySelector('button')?.focus();
          }}
        >
          <AlertDialog.Title asChild>
            <h2>{variant === 'first' ? 'Your API key' : 'Your new API key'}</h2>
          </AlertDialog.Title>
          <AlertDialog.Description>For {appName}</AlertDialog.Description>
          <div className="alert warning">
            ⚠ Copy this key now. We won&apos;t show it again. If you lose it,
            create a new key.
          </div>
          <label htmlFor="revealed-key">API key</label>
          <textarea
            ref={key}
            id="revealed-key"
            className="mono"
            readOnly
            value={credential.key}
            rows={3}
            tabIndex={-1}
          />
          <div ref={copy}>
            <CopyButton
              value={credential.key}
              onCopyError={() => {
                key.current?.select();
                setManual(true);
              }}
            />
          </div>
          {manual && (
            <p role="status">
              Couldn&apos;t copy automatically. The key is selected — press
              Ctrl+C (⌘C on Mac).
            </p>
          )}
          <p>
            Send it in the <code>{credential.headerName}</code> header:
          </p>
          <code className="code-value">
            {credential.headerName}: {credential.key}
          </code>
          <CopyButton
            value={`${credential.headerName}: ${credential.key}`}
            ariaLabel="Copy header line"
          />
          <p>Works with: {apiTitles.join(', ')}</p>
          <div className="actions">
            <Button onClick={onDone}>I&apos;ve saved it</Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

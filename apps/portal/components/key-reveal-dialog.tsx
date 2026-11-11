// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, Button, CopyButton } from '@portal/ui';
import type { IssuedCredential } from '../lib/types';
export function KeyRevealDialog({
  open,
  credential,
  appName,
  apiTitles,
  variant,
  onDone,
  onCloseAutoFocus,
}: {
  open: boolean;
  credential: IssuedCredential;
  appName: string;
  apiTitles: string[];
  variant: 'first' | 'additional';
  onDone: () => void;
  onCloseAutoFocus?: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const headerLine = useRef<HTMLElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const check = () =>
      setOverflowing(element.scrollHeight > element.clientHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);
  const copy = useRef<HTMLDivElement>(null);
  const key = useRef<HTMLTextAreaElement>(null);
  const [manual, setManual] = useState(false);
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content
          className="dialog key-reveal"
          onCloseAutoFocus={(event) => {
            if (onCloseAutoFocus) {
              event.preventDefault();
              onCloseAutoFocus();
            }
          }}
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
          <div
            ref={body}
            className="key-details stack"
            tabIndex={overflowing ? 0 : undefined}
            aria-label={overflowing ? 'Key details' : undefined}
          >
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
                announce="API key copied."
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
            <code ref={headerLine} className="code-value">
              {credential.headerName}: {credential.key}
            </code>
            <CopyButton
              value={`${credential.headerName}: ${credential.key}`}
              label="⧉"
              ariaLabel="Copy header line"
              announce="Header line copied."
              failedMessage="Couldn't copy the header line. Select it and press Ctrl+C (⌘C on Mac)."
              onFailed={() => {
                const selection = window.getSelection();
                if (!headerLine.current || !selection) return;
                const range = document.createRange();
                range.selectNodeContents(headerLine.current);
                selection.removeAllRanges();
                selection.addRange(range);
              }}
            />
            <p>Works with: {apiTitles.join(', ')}</p>
          </div>
          <div className="actions key-footer">
            <Button onClick={onDone}>I&apos;ve saved it</Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

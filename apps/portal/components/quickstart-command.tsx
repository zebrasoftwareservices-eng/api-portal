// SPDX-License-Identifier: Apache-2.0
'use client';
import { useState, type ReactNode } from 'react';
import { CopyButton } from '@portal/ui';
import { QUICKSTART_COMMAND } from '../lib/demo';
export function QuickstartCommand({ children }: { children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="quickstart-command field">
      <span>Clone the repo, then run:</span>
      <code className="code-value">{QUICKSTART_COMMAND}</code>
      <div className="row">
        <CopyButton
          value={QUICKSTART_COMMAND}
          ariaLabel="Copy quickstart command"
          copiedMessage="Quickstart command copied."
          onCopyError={() => setFailed(true)}
        />
        {children}
      </div>
      {failed && (
        <p className="hint">
          Couldn&apos;t copy automatically. Select the command and copy it.
        </p>
      )}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import { useState } from 'react';
import { Scalar, ReferenceBoundary } from './reference';
import { referenceOptions } from '../lib/reference-options';
import { referenceDocument } from '../lib/reference-document';
export function DemoReference({
  document,
}: {
  document: Record<string, unknown>;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ReferenceBoundary key={attempt} retry={() => setAttempt((n) => n + 1)}>
      <Scalar
        configuration={{
          ...referenceOptions(document),
          content: referenceDocument(document),
          theme: 'none',
          hideDarkModeToggle: true,
          forceDarkModeState: 'light',
          persistAuth: false,
          agent: { disabled: true },
          withDefaultFonts: false,
          hideTestRequestButton: true,
          hideClientButton: true,
          showDeveloperTools: 'never',
          telemetry: false,
          customCss:
            `${referenceOptions(document).customCss} .scalar-reference-intro-auth, .scalar-reference-intro-server { display: none !important; }`,
        }}
      />
    </ReferenceBoundary>
  );
}

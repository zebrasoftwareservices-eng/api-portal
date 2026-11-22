// SPDX-License-Identifier: Apache-2.0
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  findScalarResponseContainer,
  ScalarTracePortal,
} from './scalar-trace-portal';

const response = {
  traceState: 'off' as const,
  responseStatus: 200,
  sequence: 1,
};

it('mounts the trace after Scalar response content when it is available', async () => {
  const rootRef = createRef<HTMLDivElement>();
  render(
    <div ref={rootRef}>
      <div className="response-section-content" role="tabpanel">
        <div className="response-section-content-body">Response body</div>
      </div>
      <ScalarTracePortal rootRef={rootRef} response={response} isAdmin={false} />
    </div>,
  );
  const responseContainer = findScalarResponseContainer(rootRef.current!);
  await waitFor(() =>
    expect(
      responseContainer?.querySelector('[data-portal-try-it-trace]'),
    ).not.toBeNull(),
  );
  expect(responseContainer?.lastElementChild).toContainElement(
    screen.getByRole('heading', { name: 'Trace' }),
  );
});

it('mounts the trace inside a Try it client outside the reference root', async () => {
  const rootRef = createRef<HTMLDivElement>();
  render(
    <div>
      <div ref={rootRef}>
        <ScalarTracePortal rootRef={rootRef} response={response} isAdmin={false} />
      </div>
      <div className="scalar-client" role="dialog" />
    </div>,
  );
  expect(screen.getByRole('heading', { name: 'Trace' })).toBeInTheDocument();
  const client = document.querySelector('.scalar-client');
  const section = document.createElement('div');
  section.className = 'response-section-content';
  section.setAttribute('role', 'tabpanel');
  client?.append(section);
  await waitFor(() =>
    expect(section.querySelector('[data-portal-try-it-trace]')).not.toBeNull(),
  );
  expect(section).toContainElement(screen.getByRole('heading', { name: 'Trace' }));
});

it('uses the visible fallback when Scalar has no response container', () => {
  const rootRef = createRef<HTMLDivElement>();
  render(
    <div ref={rootRef}>
      <ScalarTracePortal rootRef={rootRef} response={response} isAdmin={false} />
    </div>,
  );
  expect(screen.getByRole('heading', { name: 'Trace' })).toBeInTheDocument();
  expect(document.querySelector('.try-it-trace-fallback')).not.toBeNull();
});

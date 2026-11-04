// SPDX-License-Identifier: Apache-2.0
'use client';
import { Component, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@portal/ui';
import '@scalar/api-reference-react/style.css';
import { api } from '../lib/client';
import { useResource } from './use-resource';
export const Scalar = dynamic(
  () => import('@scalar/api-reference-react').then((m) => m.ApiReferenceReact),
  { ssr: false, loading: () => <p role="status">Loading API reference…</p> },
);
export class ReferenceBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="alert error">
        The API reference didn&apos;t load.{' '}
        <Button onClick={this.props.retry}>Try again</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Reference({ documentUrl }: { documentUrl: string }) {
  const [attempt, setAttempt] = useState(0);
  const document = useResource(() =>
    api.GET('/v1/apis/{slug}/openapi.json', {
      params: {
        path: { slug: decodeURIComponent(documentUrl.split('/').at(-2) || '') },
      },
    }),
  );
  if (document.loading) return <p role="status">Loading API reference…</p>;
  if (document.error)
    return (
      <div role="alert" className="alert error">
        The API reference didn&apos;t load.{' '}
        <Button onClick={document.reload}>Try again</Button>
      </div>
    );
  return (
    <ReferenceBoundary key={attempt} retry={() => setAttempt((n) => n + 1)}>
      <Scalar
        configuration={{
          url: documentUrl,
          proxyUrl: '/api/v1/try-it',
          theme: 'none',
          hideDarkModeToggle: true,
          forceDarkModeState: 'light',
          persistAuth: false,
          agent: { disabled: true },
          withDefaultFonts: false,
        }}
      />
    </ReferenceBoundary>
  );
}

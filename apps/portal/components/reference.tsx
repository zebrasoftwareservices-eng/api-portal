// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  Component,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@portal/ui';
import '@scalar/api-reference-react/style.css';
import { api } from '../lib/client';
import { useResource } from './use-resource';
import { referenceOptions } from '../lib/reference-options';
import { referenceDocument } from '../lib/reference-document';
import { useColorMode } from '../lib/use-color-mode';
import { createScalarResponseBridge } from '../lib/scalar-response-bridge';
import { type TryItResponseTrace } from './try-it-trace-panel';
import { ScalarTracePortal } from './scalar-trace-portal';
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
export function Reference({
  documentUrl,
  slug,
  version,
  initialDocument,
  isAdmin = false,
}: {
  documentUrl: string;
  slug?: string;
  version?: string;
  initialDocument?: Record<string, unknown>;
  isAdmin?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const colorMode = useColorMode();
  const [traceResponse, setTraceResponse] = useState<TryItResponseTrace>();
  const scalarRoot = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const onResponseReceived = useCallback(({ response }: { response: Response }) => {
    const traceState = response.headers.get('X-Portal-Trace-State');
    if (!isTraceState(traceState)) return;
    sequence.current += 1;
    setTraceResponse({
      traceState,
      traceId: response.headers.get('X-Portal-Trace-Id') || undefined,
      responseStatus: response.status,
      sequence: sequence.current,
    });
  }, []);
  const responseBridge = useMemo(
    () => createScalarResponseBridge(onResponseReceived),
    [onResponseReceived],
  );
  const document = useResource(() =>
    initialDocument
      ? Promise.resolve({ data: initialDocument })
      : version && slug
        ? api.GET('/v1/apis/{slug}/versions/{version}/openapi.json', {
            params: { path: { slug, version } },
          })
        : api.GET('/v1/apis/{slug}/openapi.json', {
            params: {
              path: {
                slug: decodeURIComponent(documentUrl.split('/').at(-2) || ''),
              },
            },
          }),
  );
  if (document.loading) return <p role="status">Loading API reference…</p>;
  if (document.error)
    return (
      <div role="alert" className="alert error">
        {version
          ? `We couldn't load the reference for version ${version}. Try again in a moment.`
          : "The API reference didn't load."}{' '}
        <Button onClick={document.reload}>Try again</Button>
      </div>
    );
  return (
    <ReferenceBoundary key={attempt} retry={() => setAttempt((n) => n + 1)}>
      <div className="reference-with-trace" ref={scalarRoot}>
        <Scalar
          configuration={{
            ...referenceOptions(document.data ?? {}),
            content: referenceDocument(document.data ?? {}),
            proxyUrl: '/api/v1/try-it',
            theme: 'none',
            hideDarkModeToggle: true,
            forceDarkModeState: colorMode,
            persistAuth: false,
            agent: { disabled: true },
            withDefaultFonts: false,
            fetch: responseBridge.fetch,
          }}
        />
        <ScalarTracePortal
          rootRef={scalarRoot}
          response={traceResponse}
          isAdmin={isAdmin}
        />
      </div>
    </ReferenceBoundary>
  );
}

function isTraceState(
  value: string | null,
): value is TryItResponseTrace['traceState'] {
  return (
    value === 'traced' ||
    value === 'off' ||
    value === 'signed-out' ||
    value === 'unreachable'
  );
}

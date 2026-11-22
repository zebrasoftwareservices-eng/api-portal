// SPDX-License-Identifier: Apache-2.0
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button, CodeValue, PageHeader } from '@portal/ui';
import { signedInUser, serverClient } from '../../../../../lib/server';
import { isDemo } from '../../../../../lib/demo';
import { demoData } from '../../../../../lib/demo-data';
import { DemoReference } from '../../../../../components/demo-reference';
import { Reference } from '../../../../../components/reference';
import { VersionRow } from '../../../../../components/version-row';
import {
  ApiAccessProvider,
  ApiAccessAction,
  ApiAccessStatus,
  TryItRecovery,
} from '../../../../../components/api-access';
// Normalize the URL segment before comparing it with literal info.version values.
// Some route entry paths retain percent escapes; plus signs are not form spaces.
function decodeVersion(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    notFound();
  }
}
type Props = { params: Promise<{ slug: string; version: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug, version: encodedVersion } = await params;
  const version = decodeVersion(encodedVersion);
  const data = isDemo()
    ? slug === 'sample'
      ? demoData().api
      : undefined
    : (
        await (
          await serverClient()
        ).GET('/v1/apis/{slug}', { params: { path: { slug } } })
      ).data;
  return {
    title:
      data && data.versions.some((v) => v.version === version)
        ? `${data.title} ${version}`
        : { absolute: 'Developer Portal' },
    ...(data?.version === version
      ? { alternates: { canonical: `/apis/${slug}` } }
      : {}),
  };
}
export default async function Page({ params }: Props) {
  const { slug, version: encodedVersion } = await params;
  const version = decodeVersion(encodedVersion);
  if (isDemo()) {
    if (slug !== 'sample') notFound();
    const { api, document } = demoData();
    if (api.version !== version) notFound();
    return (
      <div className="stack">
        <PageHeader
          title={api.title}
          titleSuffix={<VersionRow api={api} />}
          breadcrumb={[
            { label: 'APIs', href: '/' },
            { label: api.title, href: `/apis/${slug}` },
            { label: version },
          ]}
        />
        <CodeValue
          value={api.gatewayBaseUrl}
          label="Base URL in a local quickstart"
        />
        <p className="alert">
          This reference is read-only here. Run the quickstart to send real
          requests.
        </p>
        <Suspense
          fallback={
            <p role="status" className="reference-loading">
              Loading API reference…
            </p>
          }
        >
          <DemoReference document={document} />
        </Suspense>
      </div>
    );
  }
  const client = await serverClient();
  const [{ data, error }, user] = await Promise.all([
    client.GET('/v1/apis/{slug}', { params: { path: { slug } } }),
    signedInUser(),
  ]);
  if (error?.status === 404) notFound();
  if (!data) throw new Error('API unavailable');
  const selected = data.versions.find((v) => v.version === version);
  if (!selected) notFound();
  const document = await client.GET(
    '/v1/apis/{slug}/versions/{version}/openapi.json',
    { params: { path: { slug, version } } },
  );
  if (document.error?.status === 404) notFound();
  return (
    <ApiAccessProvider slug={data.slug} signedIn={!!user}>
      <div className="stack">
        <PageHeader
          title={data.title}
          titleSuffix={
            <VersionRow
              api={data}
              current={version}
              markdownUrl={selected.markdownUrl}
              downloadUrl={selected.downloadUrl}
            />
          }
          breadcrumb={[
            { label: 'APIs', href: '/' },
            { label: data.title, href: `/apis/${slug}` },
            { label: version },
          ]}
          actions={<ApiAccessAction />}
        />
        {!selected.isLatest && (
          <div className="alert stack">
            <p>
              ⓘ You&apos;re reading version {version}. The latest is{' '}
              {data.version}.
            </p>
            <Button asChild variant="secondary">
              <a href={`/apis/${slug}`}>View latest version</a>
            </Button>
          </div>
        )}
        <CodeValue value={data.gatewayBaseUrl} label="Base URL" />
        <ApiAccessStatus />
        <div className="alert">
          ⓘ To try a request, go to Authentication and paste a key from an app
          that includes this API into the Value field. If you see Select Auth
          Type instead, open it and choose this API&apos;s key scheme first.
          Then choose an operation and select Send. <TryItRecovery />
        </div>
        <Suspense
          fallback={
            <p role="status" className="reference-loading">
              Loading API reference…
            </p>
          }
        >
          <Reference
            documentUrl={selected.documentUrl}
            slug={slug}
            version={version}
            initialDocument={document.data}
            isAdmin={user?.role === 'admin'}
          />
        </Suspense>
      </div>
    </ApiAccessProvider>
  );
}

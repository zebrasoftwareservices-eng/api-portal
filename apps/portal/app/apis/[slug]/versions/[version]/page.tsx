// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { Button, CodeValue, PageHeader } from '@portal/ui';
import { currentUser, serverClient } from '../../../../../lib/server';
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
type Props = { params: Promise<{ slug: string; version: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug, version } = await params;
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
    title: data ? `${data.title} ${version}` : 'API not found',
    ...(data?.version === version
      ? { alternates: { canonical: `/apis/${slug}` } }
      : {}),
  };
}
export default async function Page({ params }: Props) {
  const { slug, version } = await params;
  if (isDemo()) {
    if (slug !== 'sample') notFound();
    const { api, document } = demoData();
    if (api.version !== version) notFound();
    return (
      <div className="stack">
        <PageHeader
          title={api.title}
          breadcrumb={[
            { label: 'APIs', href: '/' },
            { label: api.title, href: `/apis/${slug}` },
            { label: version },
          ]}
        />
        <VersionRow api={api} />
        <CodeValue
          value={api.gatewayBaseUrl}
          label="Base URL in a local quickstart"
        />
        <p className="alert">
          This reference is read-only here. Run the quickstart to send real
          requests.
        </p>
        <DemoReference document={document} />
      </div>
    );
  }
  const client = await serverClient();
  const [{ data, error }, user] = await Promise.all([
    client.GET('/v1/apis/{slug}', { params: { path: { slug } } }),
    currentUser(),
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
          breadcrumb={[
            { label: 'APIs', href: '/' },
            { label: data.title, href: `/apis/${slug}` },
            { label: version },
          ]}
          actions={<ApiAccessAction />}
        />
        <VersionRow api={data} current={version} />
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
        <Reference
          documentUrl={selected.documentUrl}
          slug={slug}
          version={version}
        />
      </div>
    </ApiAccessProvider>
  );
}

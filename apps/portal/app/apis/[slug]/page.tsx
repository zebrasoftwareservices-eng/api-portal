// SPDX-License-Identifier: Apache-2.0
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CodeValue, PageHeader } from '@portal/ui';
import { serverClient, signedInUser } from '../../../lib/server';
import {
  ApiAccessProvider,
  ApiAccessAction,
  ApiAccessStatus,
  TryItRecovery,
} from '../../../components/api-access';
import { VersionRow } from '../../../components/version-row';
import { Reference } from '../../../components/reference';
import { DemoReference } from '../../../components/demo-reference';
import { isDemo } from '../../../lib/demo';
import { demoData } from '../../../lib/demo-data';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (isDemo()) {
    if ((await params).slug !== 'sample')
      return { title: { absolute: 'Developer Portal' } };
    return { title: demoData().api.title };
  }
  const client = await serverClient();
  const { data } = await client.GET('/v1/apis/{slug}', {
    params: { path: await params },
  });
  return { title: data?.title || { absolute: 'Developer Portal' } };
}
export default async function ApiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (isDemo()) {
    if (slug !== 'sample') notFound();
    const { api, document } = demoData();
    return (
      <div className="stack">
        <PageHeader
          title={api.title}
          titleSuffix={<VersionRow api={api} />}
          breadcrumb={[{ label: 'APIs', href: '/' }, { label: api.title }]}
        />
        <CodeValue
          value={api.gatewayBaseUrl}
          label="Base URL in a local quickstart"
        />
        <div className="alert">
          <span aria-hidden="true">ⓘ</span> This reference is read-only here, so
          you can&apos;t send requests from it. To send real requests, run the
          quickstart.
        </div>
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
  return (
    <ApiAccessProvider slug={data.slug} signedIn={!!user}>
      <div className="stack">
        <PageHeader
          title={data.title}
          titleSuffix={<VersionRow api={data} />}
          breadcrumb={[{ label: 'APIs', href: '/' }, { label: data.title }]}
          actions={<ApiAccessAction />}
        />
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
          <Reference documentUrl={data.documentUrl} />
        </Suspense>
      </div>
    </ApiAccessProvider>
  );
}

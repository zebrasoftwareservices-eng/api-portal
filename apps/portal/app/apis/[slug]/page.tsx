// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { CodeValue, PageHeader } from '@portal/ui';
import { serverClient, currentUser } from '../../../lib/server';
import { keyDestination } from '../../../lib/navigation';
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
    if ((await params).slug !== 'sample') return { title: 'API not found' };
    return { title: demoData().api.title };
  }
  const client = await serverClient();
  const { data } = await client.GET('/v1/apis/{slug}', {
    params: { path: await params },
  });
  return { title: data?.title || 'API not found' };
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
          breadcrumb={[{ label: 'APIs', href: '/' }, { label: api.title }]}
        />
        <span className="badge">v{api.version}</span>
        <CodeValue
          value={api.gatewayBaseUrl}
          label="Base URL in a local quickstart"
        />
        <div className="alert">
          <span aria-hidden="true">ⓘ</span> This reference is read-only here, so
          you can&apos;t send requests from it. To send real requests, run the
          quickstart.
        </div>
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
  return (
    <div className="stack">
      <PageHeader
        title={data.title}
        breadcrumb={[{ label: 'APIs', href: '/' }, { label: data.title }]}
        actions={
          <a className="button" href={keyDestination(slug, !!user)}>
            Get an API key
          </a>
        }
      />
      <span className="badge">v{data.version}</span>
      <CodeValue value={data.gatewayBaseUrl} label="Base URL" />
      <div className="alert">
        ⓘ To try a request, paste a key from an app that includes this API into
        the apikey field under Authentication, choose an operation and select
        Send. If you get a 403, select Get an API key to create an app that
        includes it.
      </div>
      <Reference documentUrl={data.documentUrl} />
    </div>
  );
}

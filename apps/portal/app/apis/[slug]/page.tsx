// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { CodeValue, PageHeader } from '@portal/ui';
import { serverClient, currentUser } from '../../../lib/server';
import { keyDestination } from '../../../lib/navigation';
import { Reference } from '../../../components/reference';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
        ⓘ To try a request, paste your API key into the apikey field under
        Authentication, choose an operation and select Send.
      </div>
      <Reference documentUrl={data.documentUrl} />
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { signedInUser, serverClient } from '../../../../lib/server';
import { AdminVersions } from '../../../../components/admin-versions';
import { isDemo } from '../../../../lib/demo';
export const metadata = { title: 'Manage API versions' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ url?: string }>;
}) {
  if (isDemo()) notFound();
  const { slug } = await params;
  const user = await signedInUser();
  if (!user)
    redirect(`/sign-in?next=${encodeURIComponent(`/admin/apis/${slug}`)}`);
  if (user.role !== 'admin') notFound();
  const client = await serverClient();
  const { data, error } = await client.GET('/v1/apis/{slug}', {
    params: { path: { slug } },
  });
  if (error?.status === 404) notFound();
  if (!data) throw new Error('API unavailable');
  const value = (await searchParams).url;
  let initialUrl = '';
  try {
    if (value && ['http:', 'https:'].includes(new URL(value).protocol))
      initialUrl = value;
  } catch {
    /* Ignore invalid prefill. */
  }
  return <AdminVersions initial={data} initialUrl={initialUrl} />;
}

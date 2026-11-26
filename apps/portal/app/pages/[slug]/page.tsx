// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManagedPage } from '../../../components/managed-page';
import { pageBySlug, publicPageMetadata } from '../../../lib/pages-server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { data, status } = await pageBySlug((await params).slug);
  return publicPageMetadata(status, data);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { data, status } = await pageBySlug((await params).slug);
  if (status !== 200 || !data) notFound();
  return <ManagedPage page={data} />;
}

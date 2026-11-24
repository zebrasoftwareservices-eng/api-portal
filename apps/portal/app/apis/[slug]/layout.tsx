// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { apiBySlug } from '../../../lib/api-server';
import { isDemo } from '../../../lib/demo';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Missing and hidden APIs are 404 here, outside any loading boundary.
  // A decision inside the page would arrive after HTTP 200.
  const { slug } = await params;
  if (isDemo()) {
    if (slug !== 'sample') notFound();
    return children;
  }
  const { error } = await apiBySlug(slug);
  if (error?.status === 404) notFound();
  return children;
}

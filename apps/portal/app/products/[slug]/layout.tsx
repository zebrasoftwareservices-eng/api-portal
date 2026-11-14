// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { productBySlug } from '../../../lib/products-server';
import { serverClient, signedInUser } from '../../../lib/server';
import { TeamBar } from '../../../components/team-context';
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Validate before this segment's loading boundary can send a 200 response.
  const { error } = await productBySlug((await params).slug);
  if (error?.status === 404) notFound();
  const user = await signedInUser();
  if (!user) return children;
  let initial;
  try {
    initial = (await (await serverClient()).GET('/v1/teams')).data;
  } catch {
    /* team unavailable disables writes */
  }
  return <TeamBar initial={initial}>{children}</TeamBar>;
}

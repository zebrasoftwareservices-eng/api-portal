// SPDX-License-Identifier: Apache-2.0
import { changelogBySlug } from '../../../../lib/changelog-server';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // A not-found decision inside loading.tsx would arrive after HTTP 200.
  await changelogBySlug((await params).slug);
  return children;
}

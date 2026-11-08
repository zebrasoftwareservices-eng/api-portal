// SPDX-License-Identifier: Apache-2.0
import { Dashboard } from '../../components/dashboard';
export const metadata = { title: 'My apps' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ api?: string | string[] }>;
}) {
  const { api } = await searchParams;
  return <Dashboard slug={typeof api === 'string' ? api : undefined} />;
}

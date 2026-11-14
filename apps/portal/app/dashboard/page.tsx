// SPDX-License-Identifier: Apache-2.0
import { Dashboard } from '../../components/dashboard';
export const metadata = { title: 'My apps' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ api?: string | string[]; notice?: string }>;
}) {
  const { api, notice } = await searchParams;
  return (
    <Dashboard
      notice={notice}
      slug={typeof api === 'string' ? api : undefined}
    />
  );
}

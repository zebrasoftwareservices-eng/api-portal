// SPDX-License-Identifier: Apache-2.0
import { Invitation } from '../../../components/invitation';
export const metadata = { title: 'Invitation', referrer: 'no-referrer' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <Invitation token={token || ''} />;
}

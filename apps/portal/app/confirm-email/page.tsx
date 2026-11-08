// SPDX-License-Identifier: Apache-2.0
import { ConfirmEmail } from '../../components/password-recovery';
export const metadata = { title: 'Confirm new email', referrer: 'no-referrer' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const query = await searchParams;
  return <ConfirmEmail initialToken={query.token} />;
}

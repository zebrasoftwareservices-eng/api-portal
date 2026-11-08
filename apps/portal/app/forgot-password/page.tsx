// SPDX-License-Identifier: Apache-2.0
import { ForgotPassword } from '../../components/password-recovery';
export const metadata = {
  title: 'Reset your password',
  referrer: 'no-referrer',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const query = await searchParams;
  return <ForgotPassword initialEmail={query.email} />;
}

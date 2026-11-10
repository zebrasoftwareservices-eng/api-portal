// SPDX-License-Identifier: Apache-2.0
import { ResetPassword } from '../../components/password-recovery';
export const metadata = {
  title: 'Choose a new password',
  referrer: 'no-referrer',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <ResetPassword
      initialToken={query.token}
      invalid={query.error === 'INVALID_TOKEN'}
    />
  );
}

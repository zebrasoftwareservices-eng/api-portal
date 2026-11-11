// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { signedInUser } from '../../../../lib/server';
import { AccountSettings } from '../../../../components/account-settings';
export const metadata = { title: 'Accounts' };
export default async function Page() {
  const user = await signedInUser();
  if (!user) redirect('/sign-in?next=%2Fadmin%2Fsettings%2Faccounts');
  if (user.role !== 'admin') notFound();
  return <AccountSettings />;
}

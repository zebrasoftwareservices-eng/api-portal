// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/server';
import { MailSettings } from '../../../../components/mail-settings';
export const metadata = { title: 'Mail' };
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fadmin%2Fsettings%2Fmail');
  if (user.role !== 'admin') notFound();
  return <MailSettings />;
}

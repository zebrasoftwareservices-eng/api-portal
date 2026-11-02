// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../lib/server';
import { AdminApis } from '../../../components/admin-apis';
export const metadata = { title: 'Manage APIs' };
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fadmin%2Fapis');
  if (user.role !== 'admin') notFound();
  return <AdminApis />;
}

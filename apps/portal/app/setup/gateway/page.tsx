// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../lib/server';
import { Gateways } from '../../../components/gateways';
export const metadata = { title: 'Connect your Kong' };
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fsetup%2Fgateway');
  if (user.role !== 'admin') notFound();
  return <Gateways setup />;
}

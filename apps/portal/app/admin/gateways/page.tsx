// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { signedInUser } from '../../../lib/server';
import { Gateways } from '../../../components/gateways';
export const metadata = { title: 'Gateways' };
export default async function Page() {
  const user = await signedInUser();
  if (!user) redirect('/sign-in?next=%2Fadmin%2Fgateways');
  if (user.role !== 'admin') notFound();
  return <Gateways />;
}

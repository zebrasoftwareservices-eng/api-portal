// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { signedInUser } from '../../../lib/server';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await signedInUser();
  if (!user) redirect('/sign-in?next=%2Fadmin%2Fproducts');
  if (user.role !== 'admin') notFound();
  return children;
}

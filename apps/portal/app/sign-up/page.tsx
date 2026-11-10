// SPDX-License-Identifier: Apache-2.0
import { redirect } from 'next/navigation';
import { AuthForm } from '../../components/auth-form';
import { currentUser } from '../../lib/server';
export const metadata = { title: 'Create account' };
export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  if (await currentUser()) redirect('/dashboard');
  return (
    <AuthForm
      email={(await searchParams).email}
      mode="sign-up"
      next={(await searchParams).next}
    />
  );
}

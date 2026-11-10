// SPDX-License-Identifier: Apache-2.0
import { redirect } from 'next/navigation';
import { AuthForm } from '../../components/auth-form';
import { currentUser } from '../../lib/server';
export const metadata = { title: 'Sign in' };
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; reset?: string }>;
}) {
  if (await currentUser()) redirect('/dashboard');
  return (
    <AuthForm
      mode="sign-in"
      email={(await searchParams).email}
      next={(await searchParams).next}
      reset={(await searchParams).reset === '1'}
    />
  );
}

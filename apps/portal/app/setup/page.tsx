// SPDX-License-Identifier: Apache-2.0
import { redirect } from 'next/navigation';
import { serverClient } from '../../lib/server';
import { SetupForm } from '../../components/setup-form';
import { SetupUnavailable } from '../../components/setup-unavailable';
export const metadata = { title: 'Set up your portal' };
export default async function Page() {
  const client = await serverClient();
  const result = await client.GET('/v1/setup').catch(() => null);
  if (!result?.data) return <SetupUnavailable />;
  if (!result.data.adminRequired) redirect('/');
  return <SetupForm setupTokenRequired={result.data.setupTokenRequired} />;
}

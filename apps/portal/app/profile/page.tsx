// SPDX-License-Identifier: Apache-2.0
import { Profile } from '../../components/profile';
export const metadata = { title: 'Profile' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <Profile
      verified={query.verified === '1'}
      invalid={query.error === 'invalid_token'}
    />
  );
}

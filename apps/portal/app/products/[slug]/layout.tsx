// SPDX-License-Identifier: Apache-2.0
import { serverClient, signedInUser } from '../../../lib/server';
import { TeamBar } from '../../../components/team-context';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await signedInUser();
  if (!user) return children;
  let initial;
  try {
    initial = (await (await serverClient()).GET('/v1/teams')).data;
  } catch {
    /* team unavailable disables writes */
  }
  return <TeamBar initial={initial}>{children}</TeamBar>;
}

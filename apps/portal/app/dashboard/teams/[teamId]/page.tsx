// SPDX-License-Identifier: Apache-2.0
import { TeamPage } from '../../../../components/teams';
export const metadata = { title: 'Team' };
export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamPage key={teamId} teamId={teamId} />;
}

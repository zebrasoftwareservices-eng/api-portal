// SPDX-License-Identifier: Apache-2.0
import { serverClient } from '../../lib/server';
import { TeamBar } from '../../components/team-context';
import type { ReactNode } from 'react';
import { DashboardVerification } from '../../components/account-shared';
export default async function Layout({ children }: { children: ReactNode }) {
  let initial;
  try {
    initial = (await (await serverClient()).GET('/v1/teams')).data;
  } catch {
    /* The page below retains its own error state. */
  }
  return (
    <div className="stack">
      <DashboardVerification />
      <TeamBar initial={initial}>{children}</TeamBar>
    </div>
  );
}

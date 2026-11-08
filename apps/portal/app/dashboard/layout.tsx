// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { DashboardVerification } from '../../components/account-shared';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="stack">
      <DashboardVerification />
      {children}
    </div>
  );
}

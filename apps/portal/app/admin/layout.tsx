// SPDX-License-Identifier: Apache-2.0
import { AdminNav } from '../../components/admin-nav';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stack">
      <AdminNav />
      {children}
    </div>
  );
}

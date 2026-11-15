// SPDX-License-Identifier: Apache-2.0
import { isDemo } from '../../../lib/demo';
export default function Loading() {
  return (
    <div role="status" className="stack">
      <p>Loading API reference…</p>
      <div className="skeleton" style={{ height: 36 }} />
      <div className="skeleton agent-docs-skeleton-row" />
      {!isDemo() && <div className="skeleton agent-docs-skeleton-download" />}
      <div className="skeleton" style={{ height: 240 }} />
    </div>
  );
}

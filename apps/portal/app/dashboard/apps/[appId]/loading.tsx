// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack" role="status">
      <div className="skeleton" style={{ width: '60%' }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 240 }} />
      <span className="sr-only">Loading app…</span>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading page">
      <div className="skeleton" style={{ width: '60%' }} />
      <div className="portal-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 160 }} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

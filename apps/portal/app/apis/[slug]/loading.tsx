// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack" role="status">
      <div className="skeleton" style={{ width: 240 }} />
      <div className="skeleton" style={{ height: 64 }} />
      <div className="skeleton" style={{ width: 200, height: 36 }} />
      <p className="muted">Loading API reference…</p>
      <div className="skeleton" style={{ height: 400 }} />
    </div>
  );
}

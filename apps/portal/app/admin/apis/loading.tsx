// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack" role="status">
      <h1>APIs</h1>
      <div className="skeleton form" style={{ height: 320 }} />
      <div className="skeleton" style={{ height: 120 }} />
      <span className="sr-only">Loading Kong services…</span>
    </div>
  );
}

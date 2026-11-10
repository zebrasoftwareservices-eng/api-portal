// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div role="status" className="stack">
      <h1>API versions</h1>
      <p>Loading versions…</p>
      {[0, 1, 2].map((i) => (
        <div className="skeleton" style={{ height: 64 }} key={i} />
      ))}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack" role="status">
      <h1>My apps</h1>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 64 }} />
      ))}
      <span className="sr-only">Loading your apps…</span>
    </div>
  );
}

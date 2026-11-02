// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div className="stack form" role="status">
      <h1>Create an app</h1>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 80 }} />
      ))}
      <span className="sr-only">Loading APIs…</span>
    </div>
  );
}

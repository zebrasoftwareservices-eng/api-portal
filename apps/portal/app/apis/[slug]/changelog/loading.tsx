// SPDX-License-Identifier: Apache-2.0
export default function Loading() {
  return (
    <div role="status" className="stack">
      <p>Loading changelog…</p>
      {[0, 1].map((i) => (
        <div key={i} className="stack">
          <div className="skeleton" style={{ height: 36 }} />
          {[0, 1, 2].map((j) => (
            <div className="skeleton" key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}

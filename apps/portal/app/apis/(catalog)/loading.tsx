// SPDX-License-Identifier: Apache-2.0
// The index only. A loading.tsx beside [slug] streams this skeleton as HTTP 200
// before notFound() for an unknown or hidden API.
export default function Loading() { return <div className="stack" aria-busy="true"><h1>APIs</h1>{[1,2,3].map((n) => <div key={n} className="skeleton api-index-skeleton" />)}</div>; }

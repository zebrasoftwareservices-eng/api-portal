// SPDX-License-Identifier: Apache-2.0
'use client';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="alert error" role="alert">
      We couldn&apos;t load the products.{' '}
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="alert error">
      We couldn&apos;t load this product.{' '}
      <button onClick={reset}>Try again</button>
    </div>
  );
}

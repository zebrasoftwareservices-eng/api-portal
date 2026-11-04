// SPDX-License-Identifier: Apache-2.0
export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        We can&apos;t find that page. Check the address, or go back to the APIs.
      </p>
      <a href="/" className="button">
        Go to APIs
      </a>
    </>
  );
}

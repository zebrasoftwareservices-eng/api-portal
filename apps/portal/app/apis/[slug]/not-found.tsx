// SPDX-License-Identifier: Apache-2.0
export const metadata = { title: { absolute: 'Developer Portal' } };
export default function NotFound() {
  return (
    <>
      <h1>API not found</h1>
      <p>
        We can&apos;t find that API. It may have been unpublished, or the link
        is wrong.
      </p>
      <a className="button" href="/">
        Go to APIs
      </a>
    </>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import '@portal/ui/styles.css';
import { ServerUnavailable } from '../components/server-unavailable';
import ErrorPage from './error';
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Developer Portal</title>
      </head>
      <body>
        <header className="site-header">
          <div className="header-inner">
            <a className="brand" href="/">
              Developer Portal
            </a>
            <nav aria-label="Main navigation">
              <a href="/">APIs</a>
            </nav>
          </div>
        </header>
        <main id="main" className="container">
          {error.digest === 'PORTAL_SERVER_UNAVAILABLE' ? (
            <ServerUnavailable reset={reset} />
          ) : (
            <ErrorPage error={error} reset={reset} />
          )}
        </main>
      </body>
    </html>
  );
}

// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import '@portal/ui/styles.css';
import { currentUser } from '../lib/server';
import { Providers } from '../components/providers';
import { Header } from '../components/header';
import { DemoNotice } from '../components/demo-notice';
import { isDemo } from '../lib/demo';
export const metadata: Metadata = {
  title: { default: 'Developer Portal', template: '%s · Developer Portal' },
  description: isDemo()
    ? 'A demo of the Developer Portal with a sample API. Run the quickstart for sign-up, API keys and try-it.'
    : 'Read API references, get a key and try a call.',
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <Providers user={user}>
          <a className="skip" href="#main">
            Skip to content
          </a>
          <Header />
          <DemoNotice />
          <main id="main" className="container">
            {children}
          </main>
          <footer className="container">
            Powered by Developer Portal · Apache 2.0
          </footer>
        </Providers>
      </body>
    </html>
  );
}

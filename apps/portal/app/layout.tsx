// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@portal/ui/styles.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource-variable/source-sans-3/wght.css';
import '@fontsource-variable/noto-sans/wght.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './globals.css';
import './products/[slug]/products.css';
import './theme-editor.css';
import { currentUser } from '../lib/server';
import { loadPublicTheme } from '../lib/public-theme';
import { Providers } from '../components/providers';
import { PortalShell } from '../components/portal-shell';
import { ThemeLinks } from '../components/theme-links';
import { ThemeProvider } from '../components/theme-provider';
import { isDemo } from '../lib/demo';
import { loadPublicNavigation } from '../lib/navigation-server';
export async function generateMetadata(): Promise<Metadata> {
  const theme = await loadPublicTheme();
  return {
    title: { default: 'Developer Portal', template: '%s · Developer Portal' },
    description: isDemo()
      ? 'A demo of the Developer Portal with a sample API. Run the quickstart for sign-up, API keys and try-it.'
      : 'Read API references, get a key and try a call.',
    icons: theme.faviconUrl ? { icon: theme.faviconUrl } : undefined,
  };
}
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, theme, navigation] = await Promise.all([
    currentUser(),
    loadPublicTheme(),
    loadPublicNavigation(),
  ]);
  return (
    <html lang="en" data-theme={theme.defaultMode === 'system' ? undefined : theme.defaultMode}>
      <head>
        <Suspense fallback={null}>
          <ThemeLinks theme={theme} />
        </Suspense>
      </head>
      <body>
        <ThemeProvider theme={theme}>
          <Providers
            user={session.state === 'signed-in' ? session.user : null}
            sessionState={session.state}
          >
            <a className="skip" href="#main">
              Skip to content
            </a>
            <PortalShell navigation={navigation}>{children}</PortalShell>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { setPreviewLogo } from './theme-provider';
import { portalAssetUrl, type PreviewMode, type PublicTheme } from '../lib/theme';
function isPreviewMessage(data: unknown): data is { type: string; css?: unknown; logo?: unknown; mode?: unknown } {
  return Boolean(data) && typeof data === 'object' && (data as { type?: unknown }).type === 'portal-theme-preview';
}
export function ThemeLinks({ theme }: { theme: PublicTheme }) {
  const pathname = usePathname();
  const preview = useSearchParams().get('themePreview') === '1';
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');
  const styleRef = useRef<HTMLStyleElement>(null);
  const [framed, setFramed] = useState(false);
  const previewing = preview && framed && !admin;
  useEffect(() => {
    setFramed(window.parent !== window);
  }, []);
  useEffect(() => {
    if (!previewing) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;
      if (styleRef.current) styleRef.current.textContent = typeof event.data.css === 'string' ? event.data.css : '';
      const mode = event.data.mode;
      if (mode === 'light' || mode === 'dark') {
        document.documentElement.setAttribute('data-theme', mode satisfies PreviewMode);
      }
      setPreviewLogo(typeof event.data.logo === 'string' ? event.data.logo : null);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      setPreviewLogo(undefined);
    };
  }, [previewing]);
  if (admin) return null;
  if (previewing) return <style ref={styleRef} data-portal-theme-preview="" />;
  const stylesheet = portalAssetUrl(theme.stylesheetUrl);
  const custom = portalAssetUrl(theme.customCssUrl);
  return (
    <>
      {stylesheet && <link rel="stylesheet" href={stylesheet} />}
      {custom && <link rel="stylesheet" href={custom} />}
    </>
  );
}

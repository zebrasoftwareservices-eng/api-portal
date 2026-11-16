// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useState } from 'react';
export function useColorMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const root = document.documentElement;
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const read = () => {
      const explicit = root.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') {
        setMode(explicit);
        return;
      }
      setMode(media?.matches ? 'dark' : 'light');
    };
    read();
    media?.addEventListener('change', read);
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media?.removeEventListener('change', read);
      observer.disconnect();
    };
  }, []);
  return mode;
}

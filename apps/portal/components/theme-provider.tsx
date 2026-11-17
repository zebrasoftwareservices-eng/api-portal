// SPDX-License-Identifier: Apache-2.0
'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_PUBLIC_THEME, type PublicTheme } from '../lib/theme';
const ThemeContext = createContext<PublicTheme>(DEFAULT_PUBLIC_THEME);
export function ThemeProvider({ theme, children }: { theme: PublicTheme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
export function usePublicTheme() {
  return useContext(ThemeContext);
}
let previewLogo: string | null | undefined;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}
export function setPreviewLogo(value: string | null | undefined) {
  previewLogo = value;
  emit();
}
export function usePreviewLogo() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => previewLogo,
    () => undefined,
  );
}

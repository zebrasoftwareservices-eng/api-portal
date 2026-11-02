// SPDX-License-Identifier: Apache-2.0
'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Toaster } from '@portal/ui';
import type { App, IssuedCredential, User } from '../lib/types';
type Reveal = {
  app: App;
  credential: IssuedCredential;
  variant: 'first' | 'additional';
};
const Context = createContext<{
  user: User | null;
  reveal: Reveal | null;
  setReveal: (value: Reveal | null) => void;
}>({ user: null, reveal: null, setReveal: () => {} });
export function Providers({
  children,
  user,
}: {
  children: ReactNode;
  user: User | null;
}) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  return (
    <Context.Provider value={{ user, reveal, setReveal }}>
      {children}
      <Toaster richColors />
    </Context.Provider>
  );
}
export function usePortal() {
  return useContext(Context);
}

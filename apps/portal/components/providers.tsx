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
  sessionState: 'signed-in' | 'signed-out' | 'unknown';
  setUser: (value: User | null) => void;
  reveal: Reveal | null;
  setReveal: (value: Reveal | null) => void;
}>({
  user: null,
  sessionState: 'signed-out',
  setUser: () => {},
  reveal: null,
  setReveal: () => {},
});
export function Providers({
  children,
  user,
  sessionState = user ? 'signed-in' : 'signed-out',
}: {
  children: ReactNode;
  user: User | null;
  sessionState?: 'signed-in' | 'signed-out' | 'unknown';
}) {
  const [updatedUser, setUser] = useState<User | null | undefined>(undefined);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  return (
    <Context.Provider
      value={{
        user:
          sessionState === 'unknown'
            ? null
            : updatedUser === undefined
              ? user
              : updatedUser,
        sessionState:
          sessionState === 'unknown'
            ? 'unknown'
            : updatedUser === undefined
              ? sessionState
              : updatedUser
                ? 'signed-in'
                : 'signed-out',
        setUser,
        reveal,
        setReveal,
      }}
    >
      {children}
      <Toaster richColors />
    </Context.Provider>
  );
}
export function usePortal() {
  return useContext(Context);
}

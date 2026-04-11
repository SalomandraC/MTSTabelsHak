import { createContext, useContext } from 'react';

import type { useAuthSession } from './use-auth-session';

export type AuthSessionContextValue = ReturnType<typeof useAuthSession>;

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSessionContext() {
  const value = useContext(AuthSessionContext);

  if (!value) {
    throw new Error('useAuthSessionContext must be used within AuthGate');
  }

  return value;
}

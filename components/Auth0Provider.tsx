'use client';

import { UserProvider } from '@auth0/nextjs-auth0/client';
import { UserProvider as CustomUserProvider } from '@/hooks/useUser';

export function Auth0Provider({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <CustomUserProvider>
        {children}
      </CustomUserProvider>
    </UserProvider>
  );
} 
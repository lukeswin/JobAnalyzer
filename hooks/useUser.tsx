'use client';

import { useUser as useAuth0User, UserProfile } from '@auth0/nextjs-auth0/client';
import { createContext, useContext, ReactNode } from 'react';

interface UserContextType {
  user: UserProfile | null;
  error: Error | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user, error, isLoading } = useAuth0User();

  const value = {
    user: user || null,
    error: error || null,
    isLoading,
    isAuthenticated: !!user,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
} 
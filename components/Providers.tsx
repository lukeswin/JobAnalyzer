'use client';

import { Auth0Provider } from '@/components/Auth0Provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <Auth0Provider>{children}</Auth0Provider>;
} 
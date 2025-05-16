'use client';

import { Providers } from '@/components/Providers';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
} 
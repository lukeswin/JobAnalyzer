'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';

export function LoginButton() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <div className="text-sm font-medium">Loading...</div>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/api/auth/logout"
          className="text-sm font-medium hover:text-primary"
        >
          Logout
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/api/auth/login"
      className="text-sm font-medium hover:text-primary"
    >
      Login
    </Link>
  );
} 
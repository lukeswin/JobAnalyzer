'use client';

import { useUser } from '@/hooks/useUser';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function Dashboard() {
  const { user } = useUser();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">Welcome to your Dashboard</h1>
          <div className="mb-4">
            <p className="text-gray-600">Email: {user?.email}</p>
            <p className="text-gray-600">Subscription: Free Tier</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-md">
            <h2 className="text-lg font-semibold mb-2">Free Tier Features</h2>
            <ul className="list-disc list-inside text-gray-700">
              <li>Basic access to all features</li>
              <li>Limited usage per month</li>
              <li>Community support</li>
            </ul>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 
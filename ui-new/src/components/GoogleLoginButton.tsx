import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export const GoogleLoginButton: React.FC = () => {
  const { user, logout } = useAuth();

  // This component only renders when authenticated (protected by App-level auth gate)
  // So we don't need to handle the not-authenticated case

  if (!user) {
    return null; // Should never happen due to app-level auth gate
  }

  return (
    <div className="flex items-center gap-3">
      <img
        src={user.picture}
        alt={user.name}
        className="w-10 h-10 rounded-full border-2 border-primary-500"
      />
      <div className="hidden md:block">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {user.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {user.email}
        </div>
      </div>
      <button
        onClick={logout}
        className="btn-secondary text-sm"
        title={`Sign out ${user.email}`}
      >
        Sign Out
      </button>
    </div>
  );
};

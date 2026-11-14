'use client';

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { User } from '../lib/db';

export interface UserCardProps {
  user?: User;
  showActions?: boolean;
}

export function UserCard({ user: propUser, showActions = true }: UserCardProps) {
  const { user: authUser, logout, login } = useAuth();
  const displayUser = propUser || authUser;

  if (!displayUser) {
    return (
      <div className="p-4 border rounded bg-gray-50 text-center">
        <p className="text-gray-600 mb-2">No user signed in</p>
        {showActions && (
          <button
            onClick={() => login('usr_1')}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Sign In as Alice
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="user-card p-4 border rounded bg-white shadow-sm flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
          {displayUser.name.charAt(0)}
        </div>
        <div>
          <h4 className="font-semibold text-gray-900">{displayUser.name}</h4>
          <p className="text-sm text-gray-500">{displayUser.email}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
            {displayUser.role}
          </span>
        </div>
      </div>

      {showActions && authUser?.id === displayUser.id && (
        <button
          onClick={logout}
          className="text-sm text-red-600 hover:text-red-800 underline ml-4"
        >
          Sign Out
        </button>
      )}
    </div>
  );
}

export default UserCard;

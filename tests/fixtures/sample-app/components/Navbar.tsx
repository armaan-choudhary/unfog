'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { UserCard } from './UserCard';

export function Navbar() {
  const { user } = useAuth();

  return (
    <nav className="w-full bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-6">
        <Link href="/" className="text-xl font-bold tracking-tight text-white hover:text-blue-400">
          Unfog Sample App
        </Link>
        <div className="flex space-x-4 text-sm font-medium">
          <Link href="/" className="hover:text-blue-300 transition-colors">
            Home
          </Link>
          <Link href="/dashboard" className="hover:text-blue-300 transition-colors">
            Dashboard
          </Link>
          <Link href="/upload" className="hover:text-blue-300 transition-colors">
            Upload
          </Link>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-3">
            <span className="text-sm text-slate-300">Signed in as <strong>{user.name}</strong></span>
            <div className="hidden sm:block">
              <UserCard user={user} showActions={false} />
            </div>
          </div>
        ) : (
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500 font-medium"
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;

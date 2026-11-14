'use client';

import { useStore, store } from '../lib/store';
import { getUserById, User } from '../lib/db';

export interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  login: (userId: string) => Promise<User | null>;
  logout: () => void;
}

/**
 * Custom React hook for managing user authentication state
 */
export function useAuth(): UseAuthReturn {
  const user = useStore((s) => s.currentUser);

  const login = async (userId: string): Promise<User | null> => {
    try {
      const foundUser = await getUserById(userId);
      if (foundUser) {
        store.setCurrentUser(foundUser);
        return foundUser;
      }
      return null;
    } catch (err) {
      console.error('Failed to log in user:', err);
      return null;
    }
  };

  const logout = (): void => {
    store.setCurrentUser(null);
  };

  return {
    user,
    isAuthenticated: !!user,
    login,
    logout,
  };
}

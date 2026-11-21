'use client';

import { clearDisToken, disFetch, DisRequestError } from '@/lib/dis/api-client';
import { account, type UserProfile, type UserRole } from '@/lib/dis/appwrite-client';
import { hasDisRole } from '@/lib/dis/permissions';
import type { Models } from 'appwrite';
import { useRouter } from 'next/navigation';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { restoreDisSession } from './restore-session';

interface DisAuthContextType {
  user: Models.User<Models.Preferences> | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  retryAuth: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  canManageStaff: boolean;
  canCreateGvd: boolean;
  canOperateStation: boolean;
  canDriveTrain: boolean;
}

const DisAuthContext = createContext<DisAuthContextType>({
  user: null,
  profile: null,
  loading: true,
  authError: null,
  retryAuth: async () => {},
  logout: async () => {},
  hasRole: () => false,
  canManageStaff: false,
  canCreateGvd: false,
  canOperateStation: false,
  canDriveTrain: false,
});

export function DisAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState<string | null>(null);
  const loadAuth = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const currentAccount = await restoreDisSession();
      setUser(currentAccount);
      if (!currentAccount) {
        setProfile(null);
        clearDisToken();
        return;
      }
      const result = await disFetch<{ profile: UserProfile }>('/api/dis/profile');
      setProfile(result.profile);
    } catch (error) {
      console.warn('DIS session verification unavailable', {
        status:
          error instanceof DisRequestError
            ? error.status
            : typeof error === 'object' && error !== null && 'code' in error
              ? error.code
              : undefined,
      });
      // Preserve the distinction between failed verification and a signed-out
      // account. Neither a network error nor an API outage revokes a session.
      setAuthError(
        error instanceof DisRequestError && [400, 403, 404].includes(error.status)
          ? error.message
          : 'Prihlásenie sa nepodarilo overiť. Skontrolujte pripojenie a skúste znova.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => {
      void loadAuth();
    }, 0);
    return () => clearTimeout(initial);
  }, [loadAuth]);

  const logout = async () => {
    try {
      await account.deleteSession('current');
      clearDisToken();
      setUser(null);
      setProfile(null);
      router.replace('/dis/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const hasRole = (roles: UserRole[]) => {
    return hasDisRole(profile?.role, roles);
  };

  const canManageStaff = hasRole([
    'admin',
    'dispatcher_manager',
    'driver_manager',
    'dispatcher_instructor',
    'driver_instructor',
  ]);
  const canCreateGvd = hasRole(['admin', 'dispatcher_manager']);
  const canOperateStation = hasRole([
    'admin',
    'dispatcher_manager',
    'dispatcher_instructor',
    'dispatcher',
    'dispatcher_trainee',
  ]);
  const canDriveTrain = hasRole([
    'admin',
    'driver_manager',
    'driver_instructor',
    'driver',
    'driver_trainee',
  ]);

  return (
    <DisAuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authError,
        retryAuth: loadAuth,
        logout,
        hasRole,
        canManageStaff,
        canCreateGvd,
        canOperateStation,
        canDriveTrain,
      }}
    >
      {children}
    </DisAuthContext.Provider>
  );
}

export const useDisAuth = () => useContext(DisAuthContext);

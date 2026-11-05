'use client';

import { clearDisToken, disFetch } from '@/lib/dis/api-client';
import { account, type UserProfile, type UserRole } from '@/lib/dis/appwrite-client';
import type { Models } from 'appwrite';
import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface DisAuthContextType {
  user: Models.User<Models.Preferences> | null;
  profile: UserProfile | null;
  loading: boolean;
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

  useEffect(() => {
    async function loadAuth() {
      try {
        const currentAccount = await account.get();
        setUser(currentAccount);

        // Fetch user profile from database
        try {
          const result = await disFetch<{ profile: UserProfile }>('/api/dis/profile');
          setProfile(result.profile);
        } catch (profErr) {
          console.warn('DIS profile is unavailable:', profErr);
          setProfile(null);
        }
      } catch {
        // Not logged in
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    loadAuth();
  }, []);

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
    if (!profile) return false;
    if (profile.role === 'admin') return true; // Admin has all rights
    return roles.includes(profile.role);
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

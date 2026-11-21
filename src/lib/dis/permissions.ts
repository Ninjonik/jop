import type { UserRole } from './appwrite-client';

/** Department heads retain their role labels but have full DIS administrator access. */
export function isDisAdministrator(role: UserRole | undefined): boolean {
  return (
    role === 'admin' ||
    role === 'driver_manager' ||
    role === 'dispatcher_manager' ||
    role === 'conductor_manager' ||
    role === 'workforce_director'
  );
}

export function hasDisRole(role: UserRole | undefined, allowed: readonly UserRole[]): boolean {
  return (
    role !== undefined &&
    (isDisAdministrator(role) ||
      allowed.includes(role) ||
      (role === 'operations_dispatcher' && allowed.includes('dispatcher_manager')))
  );
}

export type WorkingMode = 'admin' | 'dispatcher' | 'driver';
export function canUseWorkingMode(role: UserRole, mode: WorkingMode) {
  if (isDisAdministrator(role)) return true;
  if (mode === 'dispatcher')
    return ['dispatcher', 'dispatcher_trainee', 'dispatcher_instructor'].includes(role);
  if (mode === 'driver')
    return ['driver', 'driver_trainee', 'driver_instructor', 'conductor', 'shuntman'].includes(
      role,
    );
  return ['operations_dispatcher', 'vehicle_manager', 'relations_manager', 'other_staff'].includes(
    role,
  );
}
export function canPublishAnnouncements(role: UserRole) {
  return (
    isDisAdministrator(role) || role === 'relations_manager' || role === 'operations_dispatcher'
  );
}

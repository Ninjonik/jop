import type { UserRole } from './appwrite-client';

/** Department heads retain their role labels but have full DIS administrator access. */
export function isDisAdministrator(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'driver_manager' || role === 'dispatcher_manager';
}

export function hasDisRole(role: UserRole | undefined, allowed: readonly UserRole[]): boolean {
  return role !== undefined && (isDisAdministrator(role) || allowed.includes(role));
}

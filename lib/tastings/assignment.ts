import type { UserRole } from '@prisma/client';

/** Reassignment is narrower than coordinator authority: Sales may assign, Tasters may not. */
export function canAssignTasting(role: UserRole) {
  return role === 'ADMIN' || role === 'PLATFORM_ADMIN' || role === 'USER';
}

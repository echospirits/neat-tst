import { UserRole } from '@prisma/client';

export const isTasterRole = (role: UserRole) => role === UserRole.TASTER;

export const getSignedInHomePath = (role: UserRole) =>
  isTasterRole(role) ? '/visits/new' : '/';

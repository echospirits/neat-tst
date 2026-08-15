import type { CalendarProviderName } from '@prisma/client';
import type { CalendarProvider } from './provider';
import { googleCalendarProvider } from './google';

export const getCalendarProvider = (provider: CalendarProviderName): CalendarProvider => {
  if (provider === 'GOOGLE') return googleCalendarProvider;
  throw new Error(`${provider} calendar support is not implemented yet.`);
};

export * from './types';

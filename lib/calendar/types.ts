export type CalendarProviderName = 'GOOGLE' | 'MICROSOFT' | 'APPLE';

export type CalendarEventDate =
  | { kind: 'all-day'; date: string }
  | { kind: 'timed'; startsAt: Date; endsAt: Date; timeZone: string };

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  schedule: CalendarEventDate;
  privateMetadata: Record<string, string>;
};

export type ExternalCalendarEvent = {
  id: string;
  status: 'confirmed' | 'cancelled';
  title: string | null;
  description: string | null;
  startDate: string | null;
  startDateTime: string | null;
  updatedAt: Date | null;
  etag: string | null;
  privateMetadata: Record<string, string>;
};

export type CalendarEventResult = {
  externalEventId: string;
  updatedAt: Date | null;
  etag: string | null;
};

export type CalendarChangePage = {
  events: ExternalCalendarEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
};

export type CalendarListEntry = {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
};

export type CalendarProviderConnection = {
  id: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  selectedCalendarId: string;
};

export class CalendarProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requiresReconnect = false,
  ) {
    super(message);
    this.name = 'CalendarProviderError';
  }
}

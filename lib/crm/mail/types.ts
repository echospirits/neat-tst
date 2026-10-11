export type MailProvider = "GOOGLE" | "MICROSOFT" | "MOCK";
export type MailChange = {
  id: string;
  kind: "EMAIL" | "CALENDAR_MEETING";
  deleted?: boolean;
  threadId?: string;
  at?: string;
  subject?: string;
  participants?: string[];
  direction?: "INBOUND" | "OUTBOUND";
  url?: string;
  private?: boolean;
};
export type MailCursor = Record<string, string>;
export type MailPage = {
  changes: MailChange[];
  cursor: MailCursor;
  more: boolean;
};
export type MailSyncInput = {
  token: string;
  email: string;
  since: Date;
  cursor: MailCursor;
  now: Date;
};
export interface MailAdapter {
  readPage(input: MailSyncInput): Promise<MailPage>;
}
export class MailProviderError extends Error {
  constructor(
    readonly code:
      | "RECONNECT"
      | "THROTTLED"
      | "RETRY"
      | "CURSOR_EXPIRED"
      | "INVALID_RESPONSE"
      | "NOT_CONFIGURED",
  ) {
    super(code);
  }
}
export async function providerJson(
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        authorization: `Bearer ${token}`,
        Prefer: 'IdType="ImmutableId"',
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new MailProviderError("RETRY");
  }
  if (!response.ok)
    throw new MailProviderError(
      response.status === 401 || response.status === 403
        ? "RECONNECT"
        : response.status === 429
          ? "THROTTLED"
          : response.status === 410 || response.status === 404
            ? "CURSOR_EXPIRED"
            : "RETRY",
    );
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new MailProviderError("INVALID_RESPONSE");
  }
}

import { z } from "zod";
import { normalizeEmail } from "../matching";
import {
  providerJson,
  MailProviderError,
  type MailAdapter,
  type MailPage,
  type MailSyncInput,
  type MailChange,
} from "./types";
const ROOT = "https://graph.microsoft.com/v1.0/me";
export function safeGraphCursor(value: string) {
  const url = new URL(value);
  if (
    url.origin !== "https://graph.microsoft.com" ||
    !url.pathname.startsWith("/v1.0/me/") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new MailProviderError("INVALID_RESPONSE");
  return url.toString();
}
const email = z.object({
  emailAddress: z.object({ address: z.string().optional() }).optional(),
});
const row = z.object({
  id: z.string(),
  "@removed": z.unknown().optional(),
  conversationId: z.string().optional(),
  subject: z.string().optional(),
  receivedDateTime: z.string().optional(),
  sentDateTime: z.string().optional(),
  from: email.optional(),
  toRecipients: z.array(email).optional(),
  ccRecipients: z.array(email).optional(),
  sensitivity: z.string().optional(),
  isCancelled: z.boolean().optional(),
  start: z.object({ dateTime: z.string(), timeZone: z.string() }).optional(),
  attendees: z.array(email).optional(),
});
export class MicrosoftMailAdapter implements MailAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async readPage(input: MailSyncInput): Promise<MailPage> {
    const cursor = { ...input.cursor };
    const stream =
      cursor.stream === "sentitems"
        ? "sentitems"
        : cursor.stream === "calendar"
          ? "calendar"
          : "inbox";
    const calendar = stream === "calendar";
    let initial: string;
    if (calendar) {
      cursor.calendarStart ||= input.since.toISOString();
      cursor.calendarEnd ||= new Date(
        input.now.getTime() + 90 * 86400000,
      ).toISOString();
      // calendarView delta uses a fixed window per synchronization cycle.
      if (
        new Date(cursor.calendarEnd).getTime() <
        input.now.getTime() + 7 * 86400000
      ) {
        delete cursor.calendar;
        cursor.calendarStart = input.since.toISOString();
        cursor.calendarEnd = new Date(
          input.now.getTime() + 90 * 86400000,
        ).toISOString();
      }
      initial = `${ROOT}/calendarView/delta?${new URLSearchParams({ startDateTime: cursor.calendarStart, endDateTime: cursor.calendarEnd })}`;
    } else
      initial = `${ROOT}/mailFolders/${stream}/messages/delta?${new URLSearchParams({ $select: "id,conversationId,subject,receivedDateTime,sentDateTime,from,toRecipients,ccRecipients,sensitivity", $filter: `receivedDateTime ge ${input.since.toISOString()}`, $top: "20" })}`;
    let raw: unknown;
    try {
      raw = await providerJson(
        cursor[stream] ? safeGraphCursor(cursor[stream]) : initial,
        input.token,
        this.fetcher,
      );
    } catch (error) {
      if (
        error instanceof MailProviderError &&
        error.code === "CURSOR_EXPIRED"
      ) {
        delete cursor[stream];
        return { changes: [], cursor, more: true };
      }
      throw error;
    }
    const page = z
      .object({
        value: z.array(row),
        "@odata.nextLink": z.string().optional(),
        "@odata.deltaLink": z.string().optional(),
      })
      .parse(raw);
    const changes: MailChange[] = page.value.map((m) => {
      const addresses = (list: z.infer<typeof email>[] = []) =>
        list.flatMap((x) =>
          x.emailAddress?.address
            ? [normalizeEmail(x.emailAddress.address)]
            : [],
        );
      let at = calendar
        ? m.start?.dateTime
        : m.sentDateTime || m.receivedDateTime;
      if (calendar && at && !/(Z|[+-]\d\d:\d\d)$/.test(at)) {
        if (m.start?.timeZone !== "UTC")
          throw new MailProviderError("INVALID_RESPONSE");
        at += "Z";
      }
      return {
        id: m.id,
        kind: calendar ? "CALENDAR_MEETING" : "EMAIL",
        deleted:
          Boolean(m["@removed"]) ||
          m.isCancelled ||
          m.sensitivity === "private" ||
          m.sensitivity === "confidential",
        threadId: m.conversationId,
        at,
        subject: m.subject?.slice(0, 500),
        participants: calendar
          ? addresses(m.attendees)
          : addresses([
              ...(m.from ? [m.from] : []),
              ...(m.toRecipients ?? []),
              ...(m.ccRecipients ?? []),
            ]),
        direction: stream === "sentitems" ? "OUTBOUND" : "INBOUND",
      };
    });
    const next = page["@odata.nextLink"],
      delta = page["@odata.deltaLink"];
    if (!next && !delta) throw new MailProviderError("INVALID_RESPONSE");
    cursor[stream] = safeGraphCursor(next || delta!);
    if (!next)
      cursor.stream =
        stream === "inbox"
          ? "sentitems"
          : stream === "sentitems"
            ? "calendar"
            : "inbox";
    return { changes, cursor, more: Boolean(next) || stream !== "calendar" };
  }
}

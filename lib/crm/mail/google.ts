import { headerParticipantNames } from "../matching";
import { z } from "zod";
import { extractEmails, normalizeEmail } from "../matching";
import { forEachInBatches } from "../../forEachInBatches";
import {
  providerJson,
  MailProviderError,
  type MailAdapter,
  type MailPage,
  type MailSyncInput,
  type MailChange,
} from "./types";
const ROOT = "https://gmail.googleapis.com/gmail/v1/users/me";
const listSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).optional(),
  nextPageToken: z.string().optional(),
});
const messageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  internalDate: z.string(),
  labelIds: z.array(z.string()).optional(),
  payload: z
    .object({
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .optional(),
    })
    .optional(),
});
const historySchema = z.object({
  historyId: z.string(),
  nextPageToken: z.string().optional(),
  history: z
    .array(
      z.object({
        messagesAdded: z
          .array(z.object({ message: z.object({ id: z.string() }) }))
          .optional(),
        labelsAdded: z.array(z.object({message:z.object({id:z.string()})})).optional(),
        labelsRemoved: z.array(z.object({message:z.object({id:z.string()})})).optional(),
        messagesDeleted: z
          .array(z.object({ message: z.object({ id: z.string() }) }))
          .optional(),
      }),
    )
    .optional(),
});
export class GoogleMailAdapter implements MailAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async readPage(input: MailSyncInput): Promise<MailPage> {
    const cursor = { ...input.cursor };
    if (cursor.turn === "calendar") return this.calendar(input);
    let ids: string[] = [],
      removed: string[] = [],
      more = false;
    if (cursor.pending) {
      ids = z.array(z.string()).parse(JSON.parse(cursor.pending));
      delete cursor.pending;
      more = Boolean(cursor.page || cursor.historyPage);
    } else if (!cursor.history) {
      // Capture history before snapshot pagination so messages arriving during the scan are replayed safely.
      if (!cursor.baseline)
        cursor.baseline = z
          .object({ historyId: z.string() })
          .parse(
            await providerJson(`${ROOT}/profile`, input.token, this.fetcher),
          ).historyId;
      cursor.mailScanStart ||= input.now.toISOString();
      cursor.snapshotSince ||= String(Math.floor(input.since.getTime() / 1000));
      const params = new URLSearchParams({
        maxResults: "20",
        q: `after:${cursor.snapshotSince} -in:trash -in:spam`,
      });
      if (cursor.page) params.set("pageToken", cursor.page);
      const page = listSchema.parse(
        await providerJson(
          `${ROOT}/messages?${params}`,
          input.token,
          this.fetcher,
        ),
      );
      ids = page.messages?.map((m) => m.id) ?? [];
      more = Boolean(page.nextPageToken);
      if (page.nextPageToken) cursor.page = page.nextPageToken;
      else {
        cursor.history = cursor.baseline;
        delete cursor.baseline;
        delete cursor.page;

      }
    } else {
      const params = new URLSearchParams({
        startHistoryId: cursor.history,
        maxResults: "20",
      });
      if (cursor.historyPage) params.set("pageToken", cursor.historyPage);
      let page: z.infer<typeof historySchema>;
      try {
        page = historySchema.parse(
          await providerJson(
            `${ROOT}/history?${params}`,
            input.token,
            this.fetcher,
          ),
        );
      } catch (error) {
        if (
          error instanceof MailProviderError &&
          error.code === "CURSOR_EXPIRED"
        ) {
          delete cursor.history;
          delete cursor.historyPage;
          return { changes: [], cursor, more: true };
        }
        throw error;
      }
      ids = [
        ...new Set(
          page.history?.flatMap(
            (h) => [...(h.messagesAdded??[]),...(h.labelsAdded??[]),...(h.labelsRemoved??[])].map(m=>m.message.id),
          ) ?? [],
        ),
      ];
      removed = [
        ...new Set(
          page.history?.flatMap(
            (h) => h.messagesDeleted?.map((m) => m.message.id) ?? [],
          ) ?? [],
        ),
      ];
      more = Boolean(page.nextPageToken);
      if (page.nextPageToken) cursor.historyPage = page.nextPageToken;
      else {
        cursor.history = page.historyId;
        delete cursor.historyPage;
      }
    }
    const changes: MailChange[] = removed.map((id) => ({
      id,
      kind: "EMAIL",
      deleted: true,
    }));
    if (ids.length > 20) {
      cursor.pending = JSON.stringify(ids.slice(20));
      more = true;
    }
    await forEachInBatches(ids.slice(0, 20), 4, async (id) => {
      if (removed.includes(id)) return;
      let raw: unknown;
      try {
        raw = await providerJson(
          `${ROOT}/messages/${encodeURIComponent(id)}?format=metadata`,
          input.token,
          this.fetcher,
        );
      } catch (error) {
        if (
          error instanceof MailProviderError &&
          error.code === "CURSOR_EXPIRED"
        ) {
          changes.push({ id, kind: "EMAIL", deleted: true });
          return;
        }
        throw error;
      }
      const m = messageSchema.parse(raw);
      const headers = m.payload?.headers ?? [];
      const header = (key: string) =>
        headers.find((h) => h.name.toLowerCase() === key)?.value ?? "";
      const at = new Date(Number(m.internalDate));
      if (!Number.isFinite(at.getTime()))
        throw new MailProviderError("INVALID_RESPONSE");
      const hidden =
        m.labelIds?.some((l) => l === "TRASH" || l === "SPAM") ?? false;
      changes.push({
        id: m.id,
        kind: "EMAIL",
        deleted: hidden,
        threadId: m.threadId,
        url: `https://mail.google.com/mail/u/${encodeURIComponent(input.email)}/#all/${encodeURIComponent(m.threadId ?? m.id)}`,
        at: at.toISOString(),
        subject: header("subject").slice(0, 500),
        participants: extractEmails(["from", "to", "cc"].map(header).join(",")),
        participantNames: headerParticipantNames(["from", "to", "cc"].map(header)),
        direction: extractEmails(header("from")).includes(
          normalizeEmail(input.email),
        )
          ? "OUTBOUND"
          : "INBOUND",
      });
    });
    const snapshot = cursor.mailScanStart ? { kind: "EMAIL" as const, startedAt: cursor.mailScanStart, from: new Date(Number(cursor.snapshotSince)*1000).toISOString(), complete: !more } : undefined;
    if (!more) { cursor.turn = "calendar"; delete cursor.mailScanStart; delete cursor.snapshotSince; }
    return { changes, cursor, more: true, snapshot };
  }
  private async calendar(input: MailSyncInput): Promise<MailPage> {
    const cursor = { ...input.cursor };
    const params = new URLSearchParams({
      maxResults: "50",
      showDeleted: "true",
      singleEvents: "true",
    });
    if (cursor.calendarSync && (!cursor.calendarEnd || new Date(cursor.calendarEnd).getTime() < input.now.getTime()+7*86400000)) {
      delete cursor.calendarSync; delete cursor.calendarPage; delete cursor.calendarSince; delete cursor.calendarEnd; delete cursor.calendarScanStart;
    }
    if (!cursor.calendarSync) {
      cursor.calendarScanStart ||= input.now.toISOString();
      cursor.calendarEnd ||= new Date(input.now.getTime()+90*86400000).toISOString();
      params.set("timeMax", cursor.calendarEnd);
    }
    if (cursor.calendarSync) params.set("syncToken", cursor.calendarSync);
    else
      params.set(
        "timeMin",
        cursor.calendarSince ||
          (cursor.calendarSince = input.since.toISOString()),
      );
    if (cursor.calendarPage) params.set("pageToken", cursor.calendarPage);
    let raw: unknown;
    try {
      raw = await providerJson(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        input.token,
        this.fetcher,
      );
    } catch (error) {
      if (
        error instanceof MailProviderError &&
        error.code === "CURSOR_EXPIRED"
      ) {
        delete cursor.calendarSync;
        delete cursor.calendarPage;
        delete cursor.calendarSince; delete cursor.calendarEnd; delete cursor.calendarScanStart;
        return { changes: [], cursor, more: true };
      }
      throw error;
    }
    const page = z
      .object({
        nextPageToken: z.string().optional(),
        nextSyncToken: z.string().optional(),
        items: z
          .array(
            z.object({
              id: z.string(),
              status: z.string().optional(),
              summary: z.string().optional(),
              visibility: z.string().optional(),
              htmlLink: z.string().optional(),
              start: z
                .object({
                  dateTime: z.string().optional(),
                  date: z.string().optional(),
                })
                .optional(),
              attendees: z
                .array(z.object({ email: z.string().optional() }))
                .optional(),
              extendedProperties: z
                .object({ private: z.record(z.string()).optional() })
                .optional(),
            }),
          )
          .optional(),
      })
      .parse(raw);
    const changes: MailChange[] = (page.items ?? []).map((e) => ({
      id: e.id,
      kind: "CALENDAR_MEETING",
      deleted:
        e.status === "cancelled" ||
        e.visibility === "private" ||
        e.visibility === "confidential",
      private: e.visibility === "private" || e.visibility === "confidential",
      subject: e.summary?.slice(0, 500),
      url: e.htmlLink,
      at:
        e.start?.dateTime ||
        (e.start?.date ? `${e.start.date}T12:00:00.000Z` : undefined),
      participants:
        e.attendees?.flatMap((a) =>
          a.email ? [normalizeEmail(a.email)] : [],
        ) ?? [],
    }));
    const snapshot = cursor.calendarScanStart ? { kind: "CALENDAR_MEETING" as const, startedAt: cursor.calendarScanStart, from: cursor.calendarSince, to: cursor.calendarEnd, complete: !page.nextPageToken } : undefined;
    if (page.nextPageToken) cursor.calendarPage = page.nextPageToken;
    else {
      if (!page.nextSyncToken) throw new MailProviderError("INVALID_RESPONSE");
      cursor.calendarSync = page.nextSyncToken;
      delete cursor.calendarPage;
      delete cursor.calendarSince; delete cursor.calendarScanStart;
      cursor.turn = "mail";
    }
    return { changes, cursor, more: Boolean(page.nextPageToken), snapshot };
  }
}

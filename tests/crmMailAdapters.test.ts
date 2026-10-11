import test from "node:test";
import assert from "node:assert/strict";
import { GoogleMailAdapter } from "../lib/crm/mail/google";
import {
  MicrosoftMailAdapter,
  safeGraphCursor,
} from "../lib/crm/mail/microsoft";
import { MockMailAdapter } from "../lib/crm/mail/mock";
import { MailProviderError, type MailSyncInput } from "../lib/crm/mail/types";
const input: MailSyncInput = {
  token: "fixture",
  email: "rep@example.com",
  since: new Date("2026-09-10"),
  now: new Date("2026-10-10"),
  cursor: {},
};
function fixture(responses: unknown[], urls: string[] = []) {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(url));
    assert.equal(
      (init?.headers as Record<string, string>).authorization,
      "Bearer fixture",
    );
    const next = responses.shift();
    return next instanceof Response ? next : Response.json(next);
  }) as typeof fetch;
}
test("Gmail snapshots preserve the initial history cursor and normalize outgoing headers", async () => {
  const urls: string[] = [];
  const adapter = new GoogleMailAdapter(
    fixture(
      [
        { historyId: "100" },
        { messages: [{ id: "one" }], nextPageToken: "page2" },
        {
          id: "one",
          internalDate: String(input.now.getTime()),
          threadId: "thread",
          payload: {
            headers: [
              { name: "From", value: "Rep <rep@example.com>" },
              { name: "To", value: "Buyer <buyer@example.com>" },
              { name: "Subject", value: "Follow up" },
            ],
          },
        },
      ],
      urls,
    ),
  );
  const page = await adapter.readPage(input);
  assert.equal(page.cursor.baseline, "100");
  assert.equal(page.cursor.page, "page2");
  assert.equal(page.changes[0].direction, "OUTBOUND");
  assert.deepEqual(page.changes[0].participants, [
    "rep@example.com",
    "buyer@example.com",
  ]);
  assert.ok(urls[1].includes("after%3A"));
});
test("Gmail expires history by resetting only mail state and preserving calendar state", async () => {
  const page = await new GoogleMailAdapter(
    fixture([new Response("", { status: 404 })]),
  ).readPage({ ...input, cursor: { history: "old", calendarSync: "keep" } });
  assert.equal(page.cursor.history, undefined);
  assert.equal(page.cursor.calendarSync, "keep");
  assert.equal(page.more, true);
});
test("Gmail history replay carries tombstones and uses header-only retrieval", async () => {
  const urls: string[] = [];
  const page = await new GoogleMailAdapter(
    fixture(
      [
        {
          historyId: "200",
          history: [
            {
              messagesDeleted: [{ message: { id: "gone" } }],
              messagesAdded: [{ message: { id: "new" } }],
            },
          ],
        },
        {
          id: "new",
          internalDate: String(input.now.getTime()),
          payload: { headers: [] },
        },
      ],
      urls,
    ),
  ).readPage({ ...input, cursor: { history: "100" } });
  assert.equal(page.cursor.history, "200");
  assert.equal(page.changes[0].deleted, true);
  assert.ok(urls[1].endsWith("format=metadata"));
});
test("Gmail calendar incremental sync never combines syncToken and timeMin", async () => {
  const urls: string[] = [];
  const page = await new GoogleMailAdapter(
    fixture(
      [
        {
          nextSyncToken: "next",
          items: [
            {
              id: "private",
              visibility: "private",
              start: { dateTime: "2026-10-10T12:00:00Z" },
            },
          ],
        },
      ],
      urls,
    ),
  ).readPage({ ...input, cursor: { turn: "calendar", calendarSync: "old" } });
  assert.ok(urls[0].includes("syncToken=old"));
  assert.ok(!urls[0].includes("timeMin"));
  assert.equal(page.changes[0].deleted, true);
  assert.equal(page.cursor.turn, "mail");
});
test("Graph cursor rejects credential exfiltration via foreign origins or unrelated paths", () => {
  for (const url of [
    "https://evil.example/v1.0/me/messages",
    "https://graph.microsoft.com.evil.example/v1.0/me/messages",
    "https://graph.microsoft.com/v1.0/users/other/messages",
    "http://graph.microsoft.com/v1.0/me/messages",
  ])
    assert.throws(() => safeGraphCursor(url), MailProviderError);
});
test("Graph persists opaque next links before switching to sent mail and then calendar", async () => {
  const next =
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=abc";
  const adapter = new MicrosoftMailAdapter(
    fixture([
      {
        value: [
          {
            id: "one",
            receivedDateTime: "2026-10-09T12:00:00Z",
            from: { emailAddress: { address: "buyer@example.com" } },
          },
        ],
        "@odata.nextLink": next,
      },
    ]),
  );
  const page = await adapter.readPage(input);
  assert.equal(page.cursor.inbox, next);
  assert.equal(page.cursor.stream, undefined);
  const done = await new MicrosoftMailAdapter(
    fixture([
      {
        value: [],
        "@odata.deltaLink": next.replace("skiptoken", "deltatoken"),
      },
    ]),
  ).readPage({ ...input, cursor: page.cursor });
  assert.equal(done.cursor.stream, "sentitems");
});
test("Graph deleted and confidential messages become tombstones without content retention", async () => {
  const page = await new MicrosoftMailAdapter(
    fixture([
      {
        value: [
          { id: "a", "@removed": { reason: "deleted" } },
          { id: "b", sensitivity: "confidential" },
        ],
        "@odata.deltaLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=x",
      },
    ]),
  ).readPage(input);
  assert.ok(page.changes.every((c) => c.deleted));
});
test("provider throttling throws a safe code without provider body or credentials", async () => {
  await assert.rejects(
    () =>
      new GoogleMailAdapter(
        fixture([new Response("secret provider response", { status: 429 })]),
      ).readPage(input),
    (e) => e instanceof MailProviderError && e.message === "THROTTLED",
  );
});
test("fixture adapter is deterministic and resumable without any network dependency", async () => {
  const adapter = new MockMailAdapter(
    Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      kind: "EMAIL" as const,
    })),
  );
  const a = await adapter.readPage(input),
    b = await adapter.readPage({ ...input, cursor: a.cursor });
  assert.equal(a.changes.length, 20);
  assert.equal(b.changes.length, 5);
  assert.equal(b.more, false);
});

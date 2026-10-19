import test from "node:test";
import assert from "node:assert/strict";
import { eventWindows } from "../lib/crm/events";
import { EventbriteProvider, MockEventProvider } from "../lib/crm/eventbrite";
test("event comparison windows exclude event day and use equal spans", () => {
  const w = eventWindows(
    new Date("2026-10-11T12:00:00Z"),
    30,
    "PREVIOUS_PERIOD",
  );
  assert.equal(w.beforeEnd.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(w.afterStart.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(
    w.afterEnd.getTime() - w.afterStart.getTime(),
    w.beforeEnd.getTime() - w.beforeStart.getTime(),
  );
});
test("Eventbrite maps paginated responses without importing attendee PII", async () => {
  let checked = false;
  const fetcher = (async (url: URL, options: RequestInit) => {
    checked = true;
    assert.equal(url.origin, "https://www.eventbriteapi.com");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(
      (options.headers as Record<string, string>).Authorization,
      "Bearer fixture",
    );
    return new Response(
      JSON.stringify({
        events: [
          {
            id: "42",
            name: { text: "Tour" },
            start: { utc: "2026-11-01T19:00:00Z" },
            end: { utc: "2026-11-01T20:00:00Z" },
            status: "live",
            venue: { name: "Visitor center" },
          },
        ],
        pagination: { has_more_items: true },
      }),
    );
  }) as typeof fetch;
  const page = await new EventbriteProvider("fixture", "123", fetcher).page(
    "2",
  );
  assert.ok(checked);
  assert.equal(page.cursor, "3");
  assert.equal(page.events[0].title, "Tour");
  await assert.rejects(() =>
    new EventbriteProvider("fixture", "123", fetcher).page(
      "https://attacker.invalid",
    ),
  );
  assert.equal((await new MockEventProvider().page()).events.length, 1);
});

import { z } from "zod";
export type ProviderEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: string;
};
export interface EventProvider {
  page(
    cursor: string | null,
  ): Promise<{ events: ProviderEvent[]; cursor: string | null }>;
}
const eventSchema = z.object({
  id: z.string(),
  name: z.object({ text: z.string().nullable() }),
  start: z.object({ utc: z.string().datetime() }),
  end: z.object({ utc: z.string().datetime() }),
  status: z.string(),
  venue: z
    .object({
      name: z.string().nullish(),
      address: z
        .object({ localized_address_display: z.string().nullish() })
        .optional(),
    })
    .nullish(),
});
export class EventbriteProvider implements EventProvider {
  constructor(
    private token: string,
    private organizationId: string,
    private request: typeof fetch = fetch,
  ) {
    if (!/^\d+$/.test(organizationId))
      throw Error("Invalid Eventbrite organization.");
  }
  async page(cursor: string | null) {
    if (cursor && !/^\d{1,6}$/.test(cursor))
      throw Error("Invalid Eventbrite cursor.");
    const url = new URL(
      `https://www.eventbriteapi.com/v3/organizations/${this.organizationId}/events/`,
    );
    url.search = new URLSearchParams({
      page: cursor ?? "1",
      order_by: "start_asc",
      time_filter: "current_future",
      expand: "venue",
    }).toString();
    const response = await this.request(url, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      throw Error(
        response.status === 401 || response.status === 403
          ? "Eventbrite authorization needs attention."
          : "Eventbrite is unavailable. Retry later.",
      );
    const parsed = z
      .object({
        events: z.array(eventSchema).max(1000),
        pagination: z.object({ has_more_items: z.boolean() }),
      })
      .parse(await response.json());
    return {
      events: parsed.events.map((e) => ({
        id: e.id,
        title: e.name.text ?? "Untitled event",
        startsAt: e.start.utc,
        endsAt: e.end.utc,
        location: [e.venue?.name, e.venue?.address?.localized_address_display]
          .filter(Boolean)
          .join(" · "),
        status:
          e.status === "canceled"
            ? "cancelled"
            : e.status === "completed"
              ? "completed"
              : "open",
      })),
      cursor: parsed.pagination.has_more_items
        ? String(Number(cursor ?? 1) + 1)
        : null,
    };
  }
}
export class MockEventProvider implements EventProvider {
  async page() {
    return {
      events: [
        {
          id: "fixture-tour",
          title: "Demo distillery tour",
          startsAt: "2026-11-01T19:00:00Z",
          endsAt: "2026-11-01T20:00:00Z",
          location: "Demo visitor center",
          status: "open",
        },
      ],
      cursor: null,
    };
  }
}

import { z } from "zod";
import { getDistanceMiles, type Coordinates } from "../location/distance";
export type RouteStop = {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates | null;
  time: number | null;
  version: string;
};
export type RouteResult = {
  ids: string[];
  source: "GOOGLE" | "STRAIGHT_LINE" | "MANUAL";
  seconds: number | null;
  meters: number | null;
  note: string;
};
export interface RouteProvider {
  plan(stops: RouteStop[]): Promise<RouteResult>;
}
export function nearbyOrder(stops: RouteStop[]): RouteResult {
  if (
    stops.length < 3 ||
    stops.some((s) => !s.coordinates) ||
    stops.some((s) => s.time !== null)
  )
    return {
      ids: stops.map((s) => s.id),
      source: "MANUAL",
      seconds: null,
      meters: null,
      note: "Original order retained. Timed appointments and stops without coordinates require manual review.",
    };
  const remaining = stops.slice(1, -1),
    ordered = [stops[0]];
  while (remaining.length) {
    remaining.sort(
      (a, b) =>
        getDistanceMiles(ordered.at(-1)!.coordinates!, a.coordinates!) -
        getDistanceMiles(ordered.at(-1)!.coordinates!, b.coordinates!),
    );
    ordered.push(remaining.shift()!);
  }
  ordered.push(stops.at(-1)!);
  return {
    ids: ordered.map((s) => s.id),
    source: "STRAIGHT_LINE",
    seconds: null,
    meters: null,
    note: "Suggested by straight-line proximity only. First and last stops stay fixed. No road, traffic, travel-time, or opening-hours estimate is available.",
  };
}
export class GoogleRouteProvider implements RouteProvider {
  constructor(
    private key: string,
    private request: typeof fetch = fetch,
  ) {}
  async plan(stops: RouteStop[]) {
    if (
      stops.length < 2 ||
      stops.length > 27 ||
      stops.some((s) => s.time !== null)
    )
      return nearbyOrder(stops);
    const point = (s: RouteStop) =>
      s.coordinates
        ? { location: { latLng: s.coordinates } }
        : { address: s.address };
    const response = await this.request(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask":
            "routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: point(stops[0]),
          destination: point(stops.at(-1)!),
          intermediates: stops.slice(1, -1).map(point),
          travelMode: "DRIVE",
          optimizeWaypointOrder: true,
        }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok) throw Error("Route provider unavailable.");
    const result = z
      .object({
        routes: z
          .array(
            z.object({
              optimizedIntermediateWaypointIndex: z
                .array(z.number().int().nonnegative())
                .default([]),
              duration: z.string().regex(/^\d+(?:\.\d+)?s$/),
              distanceMeters: z.number().nonnegative(),
            }),
          )
          .min(1),
      })
      .parse(await response.json()).routes[0];
    const indices = result.optimizedIntermediateWaypointIndex;
    if (
      indices.length !== stops.length - 2 ||
      new Set(indices).size !== indices.length ||
      indices.some((i) => i >= stops.length - 2)
    )
      throw Error("Invalid route ordering.");
    return {
      ids: [
        stops[0].id,
        ...indices.map((i) => stops[i + 1].id),
        stops.at(-1)!.id,
      ],
      source: "GOOGLE" as const,
      seconds: Number(result.duration.slice(0, -1)),
      meters: result.distanceMeters,
      note: "Google driving estimate, excluding time spent at stops. First and last stops stay fixed. Review business hours and appointments before using.",
    };
  }
}

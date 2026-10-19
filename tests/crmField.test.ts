import test from "node:test";
import assert from "node:assert/strict";
import {
  nearbyOrder,
  GoogleRouteProvider,
  type RouteStop,
} from "../lib/crm/routeProvider";
import { captureVisitGuide, defaultVisitGuides } from "../lib/crm/visitGuides";
const stops: RouteStop[] = [
  { id: "a", coordinates: { latitude: 40, longitude: -83 } },
  { id: "c", coordinates: { latitude: 42, longitude: -83 } },
  { id: "b", coordinates: { latitude: 41, longitude: -83 } },
  { id: "d", coordinates: { latitude: 43, longitude: -83 } },
].map((s) => ({
  ...s,
  name: s.id,
  address: "Fixture",
  time: null,
  version: "2026-10-11T00:00:00.000Z",
}));
test("fallback route suggests proximity without fabricating road distance or travel time", () => {
  const r = nearbyOrder(stops);
  assert.deepEqual(r.ids, ["a", "b", "c", "d"]);
  assert.equal(r.seconds, null);
  assert.equal(r.meters, null);
  assert.equal(
    nearbyOrder(stops.map((s, i) => ({ ...s, time: i === 1 ? 600 : null })))
      .source,
    "MANUAL",
  );
});
test("Google route verifies optimized permutation and reads provider duration", async () => {
  const provider = new GoogleRouteProvider(
    "fixture",
    (async () =>
      new Response(
        JSON.stringify({
          routes: [
            {
              optimizedIntermediateWaypointIndex: [1, 0],
              duration: "900s",
              distanceMeters: 7000,
            },
          ],
        }),
      )) as typeof fetch,
  );
  const r = await provider.plan(stops);
  assert.equal(r.seconds, 900);
  assert.deepEqual(r.ids, ["a", "b", "c", "d"]);
  const invalid = new GoogleRouteProvider(
    "fixture",
    (async () =>
      new Response(
        JSON.stringify({
          routes: [
            {
              optimizedIntermediateWaypointIndex: [0, 0],
              duration: "900s",
              distanceMeters: 7000,
            },
          ],
        }),
      )) as typeof fetch,
  );
  await assert.rejects(() => invalid.plan(stops));
});
test("visit guide saves trusted prompt snapshot and refuses changed template", () => {
  const form = new FormData();
  form.set("guideEnabled", "on");
  form.set("guideSignature", JSON.stringify(defaultVisitGuides[0]));
  form.set("guideAnswer0", "Stock checked");
  const result = captureVisitGuide(form, {}, "AGENCY") as {
    answers: Array<{ answer: string }>;
  };
  assert.equal(result.answers[0].answer, "Stock checked");
  form.set("guideSignature", "tampered");
  assert.throws(() => captureVisitGuide(form, {}, "AGENCY"));
});

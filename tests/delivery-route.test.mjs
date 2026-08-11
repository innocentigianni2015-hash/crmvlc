import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleMapsSegments, optimizeDeliveryRoute } from "../app/delivery-route.ts";

const origin = { latitude: 28.4636, longitude: -16.2518 };
const stops = [
  { id: "far", latitude: 28.2916, longitude: -16.6291 },
  { id: "near", latitude: 28.4682, longitude: -16.2546 },
  { id: "middle", latitude: 28.404, longitude: -16.320 },
];

test("orders the daily route from the nearest authorised point", () => {
  assert.deepEqual(optimizeDeliveryRoute(origin, stops).map((item) => item.id), ["near", "middle", "far"]);
});

test("splits a long route into mobile-safe Google Maps segments", () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ latitude: 28 + index / 100, longitude: -16 - index / 100 }));
  const segments = buildGoogleMapsSegments(origin, many);
  assert.equal(segments.length, 3);
  assert.ok(segments.every((url) => url.startsWith("https://www.google.com/maps/dir/?")));
  assert.match(segments[0], /travelmode=driving/);
});

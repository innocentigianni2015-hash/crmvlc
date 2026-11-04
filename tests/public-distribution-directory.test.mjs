import assert from "node:assert/strict";
import test from "node:test";
import { cleanPublicDistributionPoints, isUnresolvedPointName } from "../worker/public-distribution-directory.js";

function point(overrides) {
  return {
    id: crypto.randomUUID(),
    name: "Punto valido",
    island: "Tenerife",
    address: "Calle Uno, 1",
    latitude_e6: 28_000_000,
    longitude_e6: -16_000_000,
    ...overrides,
  };
}

test("recognises unresolved import filenames without hiding legitimate Foto DNI", () => {
  assert.equal(isUnresolvedPointName("PHOTO-2026-10-22-17-01-40"), true);
  assert.equal(isUnresolvedPointName("WhatsApp Image 2026-10-20.jpeg"), true);
  assert.equal(isUnresolvedPointName("storefront.jpg"), true);
  assert.equal(isUnresolvedPointName("FOTO DNI"), false);
});

test("applies verified names and removes only still-unresolved imports", () => {
  const cleaned = cleanPublicDistributionPoints([
    point({ id: "a8d876e3-5750-4547-87a1-ecf5a7577306", name: "PHOTO-2026-10-22-17-01-33 (1)" }),
    point({ id: "unverified", name: "PHOTO-unknown" }),
    point({ id: "new-point", name: "Clínica Saber" }),
  ]);

  assert.deepEqual(cleaned.map((item) => item.name), ["Clínica Saber", "La Focaccia"]);
});

test("keeps the named canonical point and drops a verified imported duplicate", () => {
  const cleaned = cleanPublicDistributionPoints([
    point({ id: "75a1e16d-eeb1-4b3b-a7ec-8869eef704cc", name: "Smart Bakery" }),
    point({ id: "f15b2a74-259b-42f4-9ac4-354f7875dc95", name: "PHOTO-2026-10-22-17-01-42 (4)" }),
  ]);

  assert.deepEqual(cleaned.map((item) => item.id), ["75a1e16d-eeb1-4b3b-a7ec-8869eef704cc"]);
});

test("collapses duplicate rows by normalised island, name and address", () => {
  const cleaned = cleanPublicDistributionPoints([
    point({ id: "one", name: "Café Bar San Eugenio", address: "Av. de los Pueblos, S/N" }),
    point({ id: "two", name: "Cafe Bar San Eugenio", address: "Av de los Pueblos S N", latitude_e6: 28_100_000 }),
    point({ id: "three", name: "Cafe Bar San Eugenio", address: "Un altro indirizzo" }),
  ]);

  assert.equal(cleaned.length, 2);
  assert.equal(cleaned[0].id, "one");
  assert.equal(cleaned[1].id, "three");
});

test("corrects placeholder coordinates used by imported records", () => {
  const [olaVerde] = cleanPublicDistributionPoints([
    point({
      id: "252cb11f-b08a-40a7-a5cc-7f4519acef0d",
      name: "PHOTO-2026-10-22-17-01-40",
      latitude_e6: 28_070_946,
      longitude_e6: -16_731_757,
    }),
  ]);

  assert.equal(olaVerde.name, "Ola Verde Coffee & Brunch");
  assert.equal(olaVerde.latitude_e6, 28_052_519);
  assert.equal(olaVerde.longitude_e6, -16_722_823);
});


const UNRESOLVED_POINT_NAME_PATTERN = /^(?:photo|img|dsc|vid)[-_\s]|^whatsapp(?:\s+image)?/i;

// These imported photos point to businesses that already have a complete,
// named record in the directory. Keep the operational rows untouched, but do
// not publish a second marker for the same place.
const VERIFIED_DUPLICATE_POINT_IDS = new Set([
  "4d5d2e01-7501-4daa-9b63-d96cbc347345",
  "f15b2a74-259b-42f4-9ac4-354f7875dc95",
  "fdf94c5a-e13e-454a-af28-ea292bba07a2",
  "88236318-5972-4a7e-9c2a-5ffa458009da",
  "ecf3911e-1ff1-453e-80ce-5c7f886f17d0",
  "1fabad5b-4a9c-4295-ba09-be426bf0a81a",
  "26c3ecc9-232c-4e26-b1ff-d78bdcbdf9d4",
  "d1e9ee7c-c8ea-48bd-8e92-adc8385b4d78",
  "00f4c71d-4768-44f6-ada9-19e13536a10d",
  "338982ea-f594-498d-9d00-ae81a0f6eaaa",
]);

// These records were imported with the photo filename as their public name.
// The corrections below are limited to businesses that can be matched to the
// stored address. Records whose address contains several possible businesses
// remain out of the public directory until an operator confirms the photo.
const VERIFIED_POINT_CORRECTIONS = Object.freeze({
  "997b3eee-60d2-4c16-bb80-0889641db57b": {
    name: "Cafetería Boulangerie",
  },
  "30adcbc4-3aee-403e-a57e-947b754202b3": {
    name: "Cose Nostre Fañabé",
  },
  "4696b523-87f2-49af-9ea7-bd62f658f2c2": {
    name: "La Media Luna",
  },
  "e0f34dbe-a9cb-422b-9b48-69167eb24cd7": {
    name: "La Salud Cafetería",
  },
  "b64e2301-a5d7-4467-8c35-e79c6cd83222": {
    name: "Tabaco Barato Los Cristianos",
    address: "Av. de Suecia, 33, 38650 Los Cristianos, Santa Cruz de Tenerife",
  },
  "a8d876e3-5750-4547-87a1-ecf5a7577306": {
    name: "La Focaccia",
    address: "C.C. X-Sur, Local 34C, Calle Lisboa 2, 38660 Costa Adeje, Santa Cruz de Tenerife",
  },
  "f998ed90-0b4a-44a4-91c7-127426f9bf73": {
    name: "Time Brunch & Coffee",
    address: "Av. V Centenario, 1, Edificio Las Terrazas, 38660 Costa Adeje, Santa Cruz de Tenerife",
  },
  "85aa6fad-4ca5-4ded-8e26-f82809750c23": {
    name: "Time Brunch & Coffee",
    address: "Av. V Centenario, 1, Edificio Las Terrazas, 38660 Costa Adeje, Santa Cruz de Tenerife",
  },
  "252cb11f-b08a-40a7-a5cc-7f4519acef0d": {
    name: "Ola Verde Coffee & Brunch",
    address: "Av. la Habana, 14, 38650 Los Cristianos, Santa Cruz de Tenerife",
    latitude_e6: 28_052_519,
    longitude_e6: -16_722_823,
  },
  "16fefba3-4a2b-4a66-9be8-ec83b67cc0bd": {
    name: "Koala Mascotas Las Chafiras",
    address: "Av. Modesto Hernandez Gonzalez, 44A, 38639 Las Chafiras, Santa Cruz de Tenerife",
  },
  "42e9feac-2855-4ef5-b840-44d2da83c769": {
    name: "Bar Deportivo Los Cristianos",
    address: "Av. de Suecia, 60, 38650 Los Cristianos, Santa Cruz de Tenerife",
    latitude_e6: 28_051_498,
    longitude_e6: -16_720_374,
  },
  "2b5db235-db47-4ced-90d6-6cb4d97e4c9b": {
    name: "Foto Teide",
    address: "C. Piedra Redonda, 33, Local 2, 38670 Adeje, Santa Cruz de Tenerife",
    latitude_e6: 28_121_775,
    longitude_e6: -16_730_231,
  },
});

function normalizeDirectoryText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isUnresolvedPointName(name) {
  const value = String(name ?? "").trim();
  return !value || UNRESOLVED_POINT_NAME_PATTERN.test(value) || /\.(?:jpe?g|png|webp)$/i.test(value);
}

export function cleanPublicDistributionPoints(points) {
  const unique = new Map();

  for (const source of points) {
    if (VERIFIED_DUPLICATE_POINT_IDS.has(source.id)) continue;
    const correction = VERIFIED_POINT_CORRECTIONS[source.id] ?? null;
    const point = correction ? { ...source, ...correction } : { ...source };
    if (isUnresolvedPointName(point.name)) continue;

    const key = [point.island, point.name, point.address].map(normalizeDirectoryText).join("|");
    if (!unique.has(key)) unique.set(key, point);
  }

  return [...unique.values()].sort((left, right) =>
    String(left.island).localeCompare(String(right.island), "it", { sensitivity: "base" })
    || String(left.name).localeCompare(String(right.name), "it", { sensitivity: "base" }),
  );
}


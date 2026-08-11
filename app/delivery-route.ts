export type RouteCoordinate = { latitude: number; longitude: number };

export function optimizeDeliveryRoute<T extends RouteCoordinate>(origin: RouteCoordinate, stops: T[]): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current = origin;
  while (remaining.length) {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    remaining.forEach((stop, index) => {
      const candidate = haversineMeters(current, stop);
      if (candidate < distance) { distance = candidate; best = index; }
    });
    const [next] = remaining.splice(best, 1);
    ordered.push(next);
    current = next;
  }
  return ordered;
}

export function buildGoogleMapsSegments<T extends RouteCoordinate>(origin: RouteCoordinate, stops: T[], stopsPerSegment = 4): string[] {
  if (!Number.isInteger(stopsPerSegment) || stopsPerSegment < 1 || stopsPerSegment > 4) throw new Error("stopsPerSegment must be between 1 and 4");
  const urls: string[] = [];
  let start = origin;
  for (let offset = 0; offset < stops.length; offset += stopsPerSegment) {
    const group = stops.slice(offset, offset + stopsPerSegment);
    const destination = group[group.length - 1];
    const waypoints = group.slice(0, -1);
    const params = new URLSearchParams({ api: "1", origin: coordinate(start), destination: coordinate(destination), travelmode: "driving" });
    if (waypoints.length) params.set("waypoints", waypoints.map(coordinate).join("|"));
    urls.push(`https://www.google.com/maps/dir/?${params}`);
    start = destination;
  }
  return urls;
}

export function haversineMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const radius = 6_371_000;
  const p1 = a.latitude * Math.PI / 180;
  const p2 = b.latitude * Math.PI / 180;
  const dp = (b.latitude - a.latitude) * Math.PI / 180;
  const dl = (b.longitude - a.longitude) * Math.PI / 180;
  const value = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function coordinate(value: RouteCoordinate): string { return `${value.latitude},${value.longitude}`; }

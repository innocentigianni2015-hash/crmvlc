const CANARY_TIME_ZONE = "Atlantic/Canary";

export function canaryDateKey(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CANARY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function canaryLocalToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const localEpoch = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(localEpoch)) return null;

  // Le Canarie usano UTC in inverno e UTC+1 in estate. Verifichiamo entrambi
  // gli offset contro Intl per rifiutare anche gli orari inesistenti al cambio DST.
  for (const offsetMinutes of [60, 0]) {
    const candidate = new Date(localEpoch - offsetMinutes * 60_000);
    if (canaryLocalParts(candidate) === `${date}T${time}`) return candidate.toISOString();
  }
  return null;
}

export function oneHourAfter(startsAt: string): string {
  return new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString();
}

function canaryLocalParts(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CANARY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

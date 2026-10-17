/**
 * Utilidades de fecha/hora con zona horaria (sin dependencias): los horarios se
 * guardan en UTC y se muestran/editan en la zona del torneo (Europe/Madrid o
 * Atlantic/Canary).
 */

export const TIMEZONES = {
  'Europe/Madrid': 'Península y Baleares',
  'Atlantic/Canary': 'Canarias',
} as const;
export type TournamentTimezone = keyof typeof TIMEZONES;
export const DEFAULT_TZ: TournamentTimezone = 'Europe/Madrid';

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

function zonedParts(ts: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ts))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Diferencia (ms) entre la hora local de la zona y UTC en un instante dado. */
function offsetAt(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** "2026-10-24T09:30" (hora local de la zona) -> Date (UTC). */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(local);
  if (!m) throw new Error(`Fecha no válida: ${local}`);
  const asUtc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
  const first = offsetAt(asUtc, timeZone);
  let ts = asUtc - first;
  const second = offsetAt(ts, timeZone);
  if (second !== first) ts = asUtc - second;
  return new Date(ts);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date/ISO -> "2026-10-24T09:30" en la zona indicada (para inputs datetime-local). */
export function utcToZonedLocal(date: Date | string | number, timeZone: string): string {
  const p = zonedParts(new Date(date).getTime(), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Fecha local "YYYY-MM-DD" de un instante en la zona indicada. */
export function zonedDate(date: Date | string | number, timeZone: string): string {
  return utcToZonedLocal(date, timeZone).slice(0, 10);
}

export function formatDateTime(date: Date | string | number, timeZone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatTime(date: Date | string | number, timeZone: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

/** "2026-10-24" -> "sáb, 24 oct 2026". Las fechas sin hora se tratan como días de calendario. */
export function formatDay(day: string, withYear = true): string {
  const [y, mo, d] = day.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(y!, mo! - 1, d!)));
}

export function formatDayRange(start: string, end: string): string {
  if (!end || start === end) return formatDay(start);
  return `${formatDay(start, false)} – ${formatDay(end)}`;
}

/** Suma días a una fecha "YYYY-MM-DD". */
export function addDays(day: string, days: number): string {
  const [y, mo, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y!, mo! - 1, d! + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

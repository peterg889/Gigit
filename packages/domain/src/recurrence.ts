/**
 * Recurrence (PRD F2.2, open engineering question #3): explicit patterns
 * materialized as ordinary slot rows — not RRULE strings. The series is a
 * generator; occurrences are plain slots with per-occurrence overrides done
 * by editing the slot. Pure functions; the db layer persists.
 *
 * Times are UTC at MVP (consistent with the rest of the system); the metro
 * timezone lands with TZ-aware rendering.
 */

export type SeriesPattern =
  | {
      freq: "weekly";
      dayOfWeek: number; // 0=Sun … 6=Sat
      startTimeUtc: string; // "HH:MM"
      durationMinutes: number;
    }
  | {
      freq: "monthly_dow"; // "first Tuesday", "third Friday" …
      dayOfWeek: number;
      week: 1 | 2 | 3 | 4 | 5; // 5 = last
      startTimeUtc: string;
      durationMinutes: number;
    };

/** Derive the pattern from a concrete first occurrence. */
export function patternFromFirst(
  firstStartsAt: Date,
  durationMinutes: number,
  freq: "weekly" | "monthly_dow",
): SeriesPattern {
  const dayOfWeek = firstStartsAt.getUTCDay();
  const startTimeUtc = `${String(firstStartsAt.getUTCHours()).padStart(2, "0")}:${String(
    firstStartsAt.getUTCMinutes(),
  ).padStart(2, "0")}`;
  if (freq === "weekly") return { freq, dayOfWeek, startTimeUtc, durationMinutes };
  const week = (Math.floor((firstStartsAt.getUTCDate() - 1) / 7) + 1) as 1 | 2 | 3 | 4 | 5;
  return { freq, dayOfWeek, week, startTimeUtc, durationMinutes };
}

/** Next `count` occurrence start datetimes strictly after `after`. */
export function nextOccurrences(
  pattern: SeriesPattern,
  after: Date,
  count: number,
): Date[] {
  const out: Date[] = [];
  const [h = 0, m = 0] = pattern.startTimeUtc.split(":").map(Number);

  if (pattern.freq === "weekly") {
    const cursor = new Date(after);
    cursor.setUTCHours(h, m, 0, 0);
    // step to the right weekday
    while (cursor.getUTCDay() !== pattern.dayOfWeek || cursor <= after)
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (out.length < count) {
      out.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return out;
  }

  // monthly_dow: Nth <weekday> of each month (week 5 = last occurrence)
  let year = after.getUTCFullYear();
  let month = after.getUTCMonth();
  while (out.length < count) {
    const d = nthWeekdayOfMonth(year, month, pattern.dayOfWeek, pattern.week);
    if (d) {
      d.setUTCHours(h, m, 0, 0);
      if (d > after) out.push(d);
    }
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: number,
  week: 1 | 2 | 3 | 4 | 5,
): Date | null {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (dayOfWeek - first.getUTCDay() + 7) % 7;
  if (week === 5) {
    // last occurrence: start from the 4th and add a week if still in-month
    const fourth = 1 + offset + 21;
    const candidate = fourth + 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, candidate <= daysInMonth ? candidate : fourth));
  }
  const day = 1 + offset + (week - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day > daysInMonth) return null; // e.g. no 5th-as-fixed week — handled by week:5=last
  return new Date(Date.UTC(year, month, day));
}

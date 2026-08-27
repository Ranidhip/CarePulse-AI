/**
 * Extracted from RecordBPScreen.tsx so these pure functions are testable
 * in isolation (see src/lib/__tests__/dateHelpers.test.ts) without
 * rendering the screen itself.
 */

/** "2026-08-06" for a given Date, in the device's local time. */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "07:30" (24-hour) for a given Date, in the device's local time. */
export function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * Combines the two text fields back into a real Date, interpreted in the
 * device's local time zone (matching what toDateInput/toTimeInput above
 * produced from `new Date()`). Returns null if either field isn't a
 * well-formed date/time — deliberately strict about the shape (not just
 * "does `new Date()` happen to parse it") so a typo like "2026-13-40"
 * doesn't silently roll over into some other date.
 */
export function parseMeasuredAt(dateText: string, timeText: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  // Catches both non-numeric NaN results and roll-over (e.g. day "32"
  // silently becoming the 1st/2nd of the next month) by checking the
  // constructed Date's own fields match what was typed.
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== Number(year) ||
    d.getMonth() !== Number(month) - 1 ||
    d.getDate() !== Number(day) ||
    d.getHours() !== Number(hour) ||
    d.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return d;
}

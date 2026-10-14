import { m } from "#lib/paraglide/messages.js";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** How long was read, in hours and whole minutes. */
export function readingTime(seconds: number): string {
  const totalMinutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (totalMinutes === 0) {
    return m.history_under_a_minute();
  }
  if (hours === 0) {
    return m.history_minutes({ minutes });
  }
  return minutes === 0
    ? m.history_hours({ hours })
    : m.history_hours_and_minutes({ hours, minutes });
}

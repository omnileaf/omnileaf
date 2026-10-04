/** How many whole minutes the device's clock is ahead of UTC at a moment, the way the core records it. */
export function utcOffsetMinutes(at: Pick<Date, "getTimezoneOffset">): number {
  return Math.round(0 - at.getTimezoneOffset());
}

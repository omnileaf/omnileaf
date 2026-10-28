const RELEASE_MS = 600;
let held: { readonly id: unknown; readonly at: number } | undefined;

export function noteHeld(id: unknown): void {
  held = { id, at: performance.now() };
}

export function isReleaseOfHold(id: unknown, event: MouseEvent): boolean {
  const isRelease =
    held !== undefined &&
    held.id === id &&
    event.timeStamp - held.at < RELEASE_MS;
  held = undefined;
  return isRelease;
}

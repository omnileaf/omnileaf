import type { Locator } from "@playwright/test";

interface Point {
  readonly x: number;
  readonly y: number;
}

const TAP_ZONES = {
  next: '[aria-label="Next page"]',
  previous: '[aria-label="Previous page"]',
  middle: '[aria-label$="the controls"]',
  scrollDown: '[aria-label="Scroll down"]',
} as const;

export async function overTheZone(
  target: Locator,
  zone: keyof typeof TAP_ZONES,
): Promise<Point> {
  const zoneBox = await target
    .page()
    .locator(`[data-tap-zones] > button${TAP_ZONES[zone]}`)
    .boundingBox();
  const targetBox = await target.boundingBox();
  if (zoneBox === null || targetBox === null) {
    throw new Error(`the target or the ${zone} zone is not on screen`);
  }
  const left = Math.max(zoneBox.x, targetBox.x);
  const right = Math.min(
    zoneBox.x + zoneBox.width,
    targetBox.x + targetBox.width,
  );
  const top = Math.max(zoneBox.y, targetBox.y);
  const bottom = Math.min(
    zoneBox.y + zoneBox.height,
    targetBox.y + targetBox.height,
  );
  if (right <= left || bottom <= top) {
    throw new Error(`the target lies outside the ${zone} zone`);
  }
  const at = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const isTargetOnTop = await target.evaluate(
    (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
    at,
  );
  if (!isTargetOnTop) {
    throw new Error(`something covers the target over the ${zone} zone`);
  }
  return at;
}

const DRAWN_ITEM = "li[aria-posinset]";

export function itemsDrawnIn(holder: Element): number {
  return Math.max(
    0,
    ...[...holder.querySelectorAll(DRAWN_ITEM)].map((item) =>
      Number(item.getAttribute("aria-posinset")),
    ),
  );
}

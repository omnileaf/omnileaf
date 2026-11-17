export function swipeAcross(target: Element, across: number): void {
  const box = target.getBoundingClientRect();
  const at = (moved: number): PointerEventInit => ({
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    bubbles: true,
    clientX: box.x + box.width / 2 + moved,
    clientY: box.y + box.height / 2,
  });
  target.dispatchEvent(new PointerEvent("pointerdown", at(0)));
  for (const moved of [across / 4, across / 2, across]) {
    target.dispatchEvent(new PointerEvent("pointermove", at(moved)));
  }
  target.dispatchEvent(new PointerEvent("pointerup", at(across)));
}

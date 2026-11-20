const MOVE_DURATION = "--transition-duration-move";
const MOVE_EASING = "--ease-emphasized";

export function settleRow(row: HTMLElement, fromTop: number): void {
  const distance = fromTop - row.getBoundingClientRect().top;
  const style = getComputedStyle(row);
  const duration = parseFloat(style.getPropertyValue(MOVE_DURATION));
  if (distance === 0 || !(duration > 0)) {
    return;
  }
  row.animate(
    [{ translate: `0 ${String(distance)}px` }, { translate: "0 0" }],
    { duration, easing: style.getPropertyValue(MOVE_EASING).trim() },
  );
}

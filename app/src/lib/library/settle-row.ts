const MOVE_DURATION = "--transition-duration-move";
const MOVE_EASING = "--ease-emphasized";
const MS_PER_SECOND = 1000;

export function durationMs(duration: string): number {
  const value = Number.parseFloat(duration);
  if (Number.isNaN(value)) {
    return 0;
  }
  return duration.trim().endsWith("ms") ? value : value * MS_PER_SECOND;
}

export function settleRow(
  row: HTMLElement,
  fromTop: number,
): Animation | undefined {
  const distance = fromTop - row.getBoundingClientRect().top;
  const style = getComputedStyle(row);
  const duration = durationMs(style.getPropertyValue(MOVE_DURATION));
  if (distance === 0 || duration === 0) {
    return undefined;
  }
  return row.animate(
    [{ translate: `0 ${String(distance)}px` }, { translate: "0 0" }],
    {
      duration,
      easing: style.getPropertyValue(MOVE_EASING).trim(),
      composite: "add",
    },
  );
}

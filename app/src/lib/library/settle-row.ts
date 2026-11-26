const MOVE_DURATION = "--transition-duration-move";
const MOVE_EASING = "--ease-emphasized";
const MS_PER_SECOND = 1000;

export interface Pose {
  readonly top: number;
  readonly shadow: string;
}

export function durationMs(duration: string): number {
  const value = Number.parseFloat(duration);
  if (Number.isNaN(value)) {
    return 0;
  }
  return duration.trim().endsWith("ms") ? value : value * MS_PER_SECOND;
}

export function poseOf(row: HTMLElement): Pose {
  return {
    top: row.getBoundingClientRect().top,
    shadow: getComputedStyle(row).boxShadow,
  };
}

export function settleRow(
  row: HTMLElement,
  lifted: Pose,
): Animation | undefined {
  const rest = poseOf(row);
  const distance = lifted.top - rest.top;
  const style = getComputedStyle(row);
  const duration = durationMs(style.getPropertyValue(MOVE_DURATION));
  if (duration === 0 || (distance === 0 && lifted.shadow === rest.shadow)) {
    return undefined;
  }
  return row.animate(
    [
      { translate: `0 ${String(distance)}px`, boxShadow: lifted.shadow },
      { translate: "0 0", boxShadow: rest.shadow },
    ],
    { duration, easing: style.getPropertyValue(MOVE_EASING).trim() },
  );
}

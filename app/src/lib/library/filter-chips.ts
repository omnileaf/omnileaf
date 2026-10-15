export interface FilterChip {
  readonly id: string;
  readonly label: string;
}

export function chipsThatFit({
  widths,
  gap,
  available,
  more,
}: {
  widths: readonly number[];
  gap: number;
  available: number;
  more: number;
}): number {
  const gaps = gap * Math.max(widths.length - 1, 0);
  const total = widths.reduce((sum, width) => sum + width, 0) + gaps;
  if (total <= available) {
    return widths.length;
  }
  const room = available - more - gap;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = used + (count === 0 ? 0 : gap) + width;
    if (next > room) {
      break;
    }
    used = next;
    count += 1;
  }
  return count;
}

export function median(values: readonly number[]): number {
  const sorted = values.toSorted((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

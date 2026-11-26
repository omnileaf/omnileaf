const STOP_DIGITS = 4;

export function cssLinearEasing(
  curve: (x: number) => number,
  stops: number,
): string {
  const values = Array.from({ length: stops + 1 }, (_, stop) =>
    Number(curve(stop / stops).toFixed(STOP_DIGITS)),
  );
  return `linear(${values.join(", ")})`;
}

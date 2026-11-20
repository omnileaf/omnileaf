const SOLVE_STEPS = 24;

function along(start: number, end: number, t: number): number {
  const rest = 1 - t;
  return 3 * rest * rest * t * start + 3 * rest * t * t * end + t * t * t;
}

export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  return (x) => {
    if (x <= 0 || x >= 1) {
      return x <= 0 ? 0 : 1;
    }
    let low = 0;
    let high = 1;
    for (let step = 0; step < SOLVE_STEPS; step += 1) {
      const middle = (low + high) / 2;
      if (along(x1, x2, middle) < x) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return along(y1, y2, (low + high) / 2);
  };
}

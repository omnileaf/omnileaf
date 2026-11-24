const SOLVE_STEPS = 24;
const ORIGIN: CurvePoint = { x: 0, y: 0 };

interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

interface CubicSegment {
  readonly control1: CurvePoint;
  readonly control2: CurvePoint;
  readonly to: CurvePoint;
}

interface PlacedSegment extends CubicSegment {
  readonly from: CurvePoint;
}

function along(
  from: number,
  control1: number,
  control2: number,
  to: number,
  t: number,
): number {
  const rest = 1 - t;
  return (
    rest * rest * rest * from +
    3 * rest * rest * t * control1 +
    3 * rest * t * t * control2 +
    t * t * t * to
  );
}

function yAt(segment: PlacedSegment, x: number): number {
  const { from, control1, control2, to } = segment;
  let low = 0;
  let high = 1;
  for (let step = 0; step < SOLVE_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (along(from.x, control1.x, control2.x, to.x, middle) < x) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return along(from.y, control1.y, control2.y, to.y, (low + high) / 2);
}

function placed(segments: readonly CubicSegment[]): PlacedSegment[] {
  return segments.map((segment, at) => ({
    ...segment,
    from: segments[at - 1]?.to ?? ORIGIN,
  }));
}

export function cubicPath(
  segments: readonly CubicSegment[],
): (x: number) => number {
  const path = placed(segments);
  return (x) => {
    if (x <= 0 || x >= 1) {
      return x <= 0 ? 0 : 1;
    }
    const segment = path.find(({ to }) => x <= to.x) ?? path.at(-1);
    return segment === undefined ? x : yAt(segment, x);
  };
}

export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  return cubicPath([
    {
      control1: { x: x1, y: y1 },
      control2: { x: x2, y: y2 },
      to: { x: 1, y: 1 },
    },
  ]);
}

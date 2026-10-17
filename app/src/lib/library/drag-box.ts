export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function boxBetween(start: Point, end: Point): Box {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function overlaps(one: Box, other: Box): boolean {
  return (
    one.left < other.left + other.width &&
    other.left < one.left + one.width &&
    one.top < other.top + other.height &&
    other.top < one.top + one.height
  );
}

export function touchedBy<Id>(
  box: Box,
  items: readonly (Box & { readonly id: Id })[],
): Id[] {
  return items.filter((item) => overlaps(box, item)).map(({ id }) => id);
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

const NOTHING: Size = { width: 0, height: 0 };

/** The size a page takes shown whole in the space, as large as fits, scaled up or down. */
export function fittedSize(page: Size, space: Size): Size {
  if (page.width <= 0 || page.height <= 0) {
    return NOTHING;
  }
  const scale = Math.min(space.width / page.width, space.height / page.height);
  if (scale <= 0) {
    return NOTHING;
  }
  return { width: page.width * scale, height: page.height * scale };
}

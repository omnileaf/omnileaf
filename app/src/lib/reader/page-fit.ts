import type { PageFit } from "./reader-settings.svelte";

export interface Size {
  readonly width: number;
  readonly height: number;
}

const NOTHING: Size = { width: 0, height: 0 };

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

export function fittedTo(page: Size, space: Size, fit: PageFit): Size {
  if (fit === "screen") {
    return fittedSize(page, space);
  }
  if (page.width <= 0 || page.height <= 0) {
    return NOTHING;
  }
  const scale =
    fit === "width" ? space.width / page.width : space.height / page.height;
  return scale <= 0
    ? NOTHING
    : { width: page.width * scale, height: page.height * scale };
}

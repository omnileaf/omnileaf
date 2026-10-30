export const WHITE = 0xffffff;
export const BLACK = 0x000000;

export type Label = typeof WHITE | typeof BLACK;

const TEXT_RATIO = 4.5;
const CHANNEL_MAX = 255;
const BYTE = 8;
const LUMINANCE_FLARE = 0.05;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const SRGB_LINEAR_LIMIT = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;

function linear(channel: number): number {
  const fraction = channel / CHANNEL_MAX;
  return fraction <= SRGB_LINEAR_LIMIT
    ? fraction / SRGB_LINEAR_SLOPE
    : ((fraction + SRGB_OFFSET) / (1 + SRGB_OFFSET)) ** SRGB_GAMMA;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & CHANNEL_MAX;
}

function luminance(rgb: number): number {
  return (
    RED_WEIGHT * linear(channel(rgb, 2 * BYTE)) +
    GREEN_WEIGHT * linear(channel(rgb, BYTE)) +
    BLUE_WEIGHT * linear(channel(rgb, 0))
  );
}

function contrast(first: number, second: number): number {
  const luminances = [luminance(first), luminance(second)];
  return (
    (Math.max(...luminances) + LUMINANCE_FLARE) /
    (Math.min(...luminances) + LUMINANCE_FLARE)
  );
}

export function labelOn(fill: number, preferred: Label): Label {
  const other = preferred === WHITE ? BLACK : WHITE;
  return contrast(fill, preferred) >= TEXT_RATIO ||
    contrast(fill, preferred) >= contrast(fill, other)
    ? preferred
    : other;
}

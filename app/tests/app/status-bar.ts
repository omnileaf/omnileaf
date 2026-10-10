const PIXEL_DATA_OFFSET_AT = 10;
const WIDTH_AT = 18;
const HEIGHT_AT = 22;
const BITS_PER_PIXEL_AT = 28;
const BITS_PER_PIXEL = 32;
const BYTES_PER_PIXEL = 4;
const LUMINANCE_LEVELS = 256;
const MID_GREY = LUMINANCE_LEVELS / 2;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;

/** The status bar's clock, as shares of the screen, clear of the screen's rounded corner. */
const CLOCK_AREA: Area = { left: 0.1, right: 0.3, top: 0.01, bottom: 0.06 };
const MIDDLE_AREA: Area = { left: 0.1, right: 0.9, top: 0.4, bottom: 0.6 };

/** A part of the screen, as shares of its width and height. */
interface Area {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface Bitmap {
  readonly bytes: Buffer;
  readonly pixelsAt: number;
  readonly width: number;
  readonly height: number;
  readonly isTopDown: boolean;
}

/** Reads the uncompressed 32-bit, blue-first bitmap that `simctl io screenshot --type=bmp` writes. */
function readBitmap(bytes: Buffer): Bitmap {
  const bitsPerPixel = bytes.readUInt16LE(BITS_PER_PIXEL_AT);
  if (bitsPerPixel !== BITS_PER_PIXEL) {
    throw new Error(
      `expected a ${String(BITS_PER_PIXEL)}-bit screenshot, not ${String(bitsPerPixel)}-bit`,
    );
  }
  const height = bytes.readInt32LE(HEIGHT_AT);
  return {
    bytes,
    pixelsAt: bytes.readUInt32LE(PIXEL_DATA_OFFSET_AT),
    width: bytes.readInt32LE(WIDTH_AT),
    height: Math.abs(height),
    isTopDown: height < 0,
  };
}

function luminanceAt(bitmap: Bitmap, x: number, y: number): number {
  const row = bitmap.isTopDown ? y : bitmap.height - 1 - y;
  const at = bitmap.pixelsAt + (row * bitmap.width + x) * BYTES_PER_PIXEL;
  const blue = bitmap.bytes.readUInt8(at);
  const green = bitmap.bytes.readUInt8(at + 1);
  const red = bitmap.bytes.readUInt8(at + 2);
  return Math.round(
    RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue,
  );
}

function luminancesIn(bitmap: Bitmap, area: Area): number[] {
  const luminances: number[] = [];
  const top = Math.floor(bitmap.height * area.top);
  const bottom = Math.floor(bitmap.height * area.bottom);
  const left = Math.floor(bitmap.width * area.left);
  const right = Math.floor(bitmap.width * area.right);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      luminances.push(luminanceAt(bitmap, x, y));
    }
  }
  return luminances;
}

function mostCommon(luminances: readonly number[]): number {
  const counts = new Array<number>(LUMINANCE_LEVELS).fill(0);
  for (const luminance of luminances) {
    counts[luminance] = (counts[luminance] ?? 0) + 1;
  }
  return counts.indexOf(Math.max(...counts));
}

export function isMiddleOfScreenDark(screenshot: Buffer): boolean {
  const luminances = luminancesIn(readBitmap(screenshot), MIDDLE_AREA);
  return mostCommon(luminances) < MID_GREY;
}

export interface StatusBarReading {
  /** How far the clock stands out from the page behind it, from 0 for invisible to 1 for black on white. */
  readonly contrast: number;
  readonly isPageDark: boolean;
}

export function readStatusBar(screenshot: Buffer): StatusBarReading {
  const luminances = luminancesIn(readBitmap(screenshot), CLOCK_AREA);
  const page = mostCommon(luminances);
  const clock = luminances.reduce(
    (farthest, luminance) => Math.max(farthest, Math.abs(luminance - page)),
    0,
  );
  return {
    contrast: clock / (LUMINANCE_LEVELS - 1),
    isPageDark: page < MID_GREY,
  };
}

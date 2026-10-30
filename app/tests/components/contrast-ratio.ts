import { resolvedColour } from "./resolved-colour";

type Channels = readonly [red: number, green: number, blue: number];

const OPAQUE = 255;

function paint(token: string): Uint8ClampedArray {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("The test browser has no 2D canvas");
  }
  context.fillStyle = resolvedColour(
    token.startsWith("--") ? token : `--native-color-${token}`,
    "color",
  );
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data;
}

function channels(token: string): Channels {
  const [red = 0, green = 0, blue = 0, alpha] = paint(token);
  if (alpha !== OPAQUE) {
    throw new Error(`${token} is not an opaque colour`);
  }
  return [red, green, blue];
}

function linear(channel: number): number {
  const fraction = channel / 255;
  return fraction <= 0.04045
    ? fraction / 12.92
    : ((fraction + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]: Channels): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrastRatio(ink: string, ground: string): number {
  const luminances = [
    relativeLuminance(channels(ink)),
    relativeLuminance(channels(ground)),
  ];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

import { resolvedColour } from "./resolved-colour";

type Channels = readonly [red: number, green: number, blue: number];

const OPAQUE = 255;
const FULL = 255;
const LINEAR_KNEE = 0.04045;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
const LUMINANCE_OFFSET = 0.05;
const WEIGHTS = [0.2126, 0.7152, 0.0722] as const;

function paint(layers: readonly string[]): Channels {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("The test browser has no 2D canvas");
  }
  for (const layer of layers) {
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  const [red = 0, green = 0, blue = 0, alpha] = context.getImageData(
    0,
    0,
    1,
    1,
  ).data;
  if (alpha !== OPAQUE) {
    throw new Error(`${layers.join(" over ")} is not an opaque colour`);
  }
  return [red, green, blue];
}

function linear(channel: number): number {
  const fraction = channel / FULL;
  return fraction <= LINEAR_KNEE
    ? fraction / LINEAR_SLOPE
    : ((fraction + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
}

function luminance(channels: Channels): number {
  return channels.reduce(
    (sum, channel, index) => sum + linear(channel) * (WEIGHTS[index] ?? 0),
    0,
  );
}

function colourOf(token: string): string {
  return resolvedColour(
    token.startsWith("--") ? token : `--native-color-${token}`,
    "color",
  );
}

export function contrastOver(
  ink: string,
  ground: string,
  backing: string,
): number {
  const groundLayers = [backing, colourOf(ground)];
  const lights = [
    luminance(paint(groundLayers)),
    luminance(paint([...groundLayers, colourOf(ink)])),
  ];
  return (
    (Math.max(...lights) + LUMINANCE_OFFSET) /
    (Math.min(...lights) + LUMINANCE_OFFSET)
  );
}

import { resolvedColour } from "./resolved-colour";

type Channels = readonly [red: number, green: number, blue: number];

const OPAQUE = 255;

function paint(colours: readonly string[]): Uint8ClampedArray {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("The test browser has no 2D canvas");
  }
  for (const colour of colours) {
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
  }
  return context.getImageData(0, 0, 1, 1).data;
}

function opaqueChannels(colours: readonly string[]): Channels {
  const [red = 0, green = 0, blue = 0, alpha] = paint(colours);
  if (alpha !== OPAQUE) {
    throw new Error(`${colours.join(" over ")} is not an opaque colour`);
  }
  return [red, green, blue];
}

function channels(token: string): Channels {
  return opaqueChannels([
    resolvedColour(
      token.startsWith("--") ? token : `--native-color-${token}`,
      "color",
    ),
  ]);
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

function ratioOf(ink: Channels, ground: Channels): number {
  const luminances = [relativeLuminance(ink), relativeLuminance(ground)];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

export function contrastRatio(ink: string, ground: string): number {
  return ratioOf(channels(ink), channels(ground));
}

function resolvedLayers(tokens: readonly string[]): string[] {
  return tokens.map((token) =>
    resolvedColour(
      token.startsWith("--") ? token : `--native-color-${token}`,
      "color",
    ),
  );
}

export function contrastOver(ink: string, layers: readonly string[]): number {
  const grounds = resolvedLayers(layers);
  return ratioOf(
    opaqueChannels([...grounds, ...resolvedLayers([ink])]),
    opaqueChannels(grounds),
  );
}

export function drawnContrast(element: Element): number {
  const style = getComputedStyle(element);
  const ground = opaqueChannels([style.backgroundColor]);
  const ink = opaqueChannels([style.backgroundColor, style.color]);
  return ratioOf(ink, ground);
}

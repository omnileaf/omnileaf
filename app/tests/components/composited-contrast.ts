import { opaqueChannels, ratioOf } from "./contrast-ratio";
import { resolvedColour } from "./resolved-colour";

function colourOf(token: string): string {
  return resolvedColour(
    token.startsWith("--") ? token : `--native-color-${token}`,
    "color",
  );
}

export function contrastOverLayers(
  ink: string,
  ground: readonly string[],
  backing: string,
): number {
  const layers = [backing, ...ground];
  return ratioOf(opaqueChannels([...layers, ink]), opaqueChannels(layers));
}

export function contrastOver(
  ink: string,
  ground: string,
  backing: string,
): number {
  return contrastOverLayers(colourOf(ink), [colourOf(ground)], backing);
}

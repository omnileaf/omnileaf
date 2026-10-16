import type { TapZones } from "./reader-settings.svelte.ts";
import type { PageTurn } from "./reading-direction.svelte.ts";

export type TapZone =
  | { readonly kind: "turn"; readonly turn: PageTurn; readonly shape: string }
  | { readonly kind: "controls" };

const CONTROLS: TapZone = { kind: "controls" };
const EDGE = "shrink-0 inline-3/10 expanded:inline-1/3";

export function tapZonesFor(
  zones: TapZones,
  leftTurn: PageTurn,
  rightTurn: PageTurn,
): readonly TapZone[] {
  switch (zones) {
    case "off":
      return [CONTROLS];
    case "lShape":
      return [
        { kind: "turn", turn: "previous", shape: "col-span-3 cursor-n-resize" },
        { kind: "turn", turn: leftTurn, shape: "cursor-w-resize" },
        CONTROLS,
        { kind: "turn", turn: rightTurn, shape: "cursor-e-resize" },
        { kind: "turn", turn: "next", shape: "col-span-3 cursor-s-resize" },
      ];
    case "edges":
      return [
        { kind: "turn", turn: leftTurn, shape: `${EDGE} cursor-w-resize` },
        CONTROLS,
        { kind: "turn", turn: rightTurn, shape: `${EDGE} cursor-e-resize` },
      ];
  }
}

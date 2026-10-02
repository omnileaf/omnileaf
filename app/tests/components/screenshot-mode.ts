import { ScreenshotMode } from "../../src/lib/screenshot-mode/screenshot-mode.svelte.ts";

const NO_STORAGE = undefined;

const STILL_CLOCK = {
  now: () => 0,
  at: () => () => undefined,
};

export function screenshotModeTurned(state: "on" | "off"): ScreenshotMode {
  const mode = new ScreenshotMode(NO_STORAGE, STILL_CLOCK);
  if (state === "on") {
    mode.toggle();
  }
  return mode;
}

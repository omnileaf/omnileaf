import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followDisplayModes } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import Switch from "./switch.svelte";

interface SwitchLook {
  readonly platform: Platform;
  readonly track: readonly [number, number];
  readonly knobOff: number;
  readonly knobOn: number;
  readonly trackOff: string;
  readonly trackOn: string;
  readonly knobOffFill: string;
  readonly edgeOff: string;
}

const LOOKS: readonly SwitchLook[] = [
  {
    platform: "linux",
    track: [32, 18.4],
    knobOff: 16,
    knobOn: 16,
    trackOff: "--input",
    trackOn: "--primary",
    knobOffFill: "--background",
    edgeOff: "transparent",
  },
  {
    platform: "android",
    track: [52, 32],
    knobOff: 16,
    knobOn: 24,
    trackOff: "#dbe5dc",
    trackOn: "#326a4d",
    knobOffFill: "#737d75",
    edgeOff: "#737d75",
  },
  {
    platform: "ios",
    track: [63, 28],
    knobOff: 37,
    knobOn: 37,
    trackOff: "rgba(60, 60, 67, 0.3)",
    trackOn: "oklch(0.6 0.17 149)",
    knobOffFill: "oklch(1 0 0)",
    edgeOff: "transparent",
  },
  {
    platform: "macos",
    track: [38, 22],
    knobOff: 18,
    knobOn: 18,
    trackOff: "--input",
    trackOn: "--macos-switch-on",
    knobOffFill: "--ios-switch-thumb",
    edgeOff: "transparent",
  },
  {
    platform: "windows",
    track: [40, 20],
    knobOff: 12,
    knobOn: 14,
    trackOff: "transparent",
    trackOn: "--primary",
    knobOffFill: "--windows-secondary-text",
    edgeOff: "--windows-secondary-text",
  },
];

function trackOf(name: string): HTMLElement {
  const track = page
    .getByRole("switch", { name })
    .element()
    .querySelector<HTMLElement>(":scope > span");
  if (track === null) {
    throw new Error(`the ${name} switch has no track`);
  }
  return track;
}

function knobOf(name: string): HTMLElement {
  const knob = trackOf(name).firstElementChild;
  if (!(knob instanceof HTMLElement)) {
    throw new Error(`the ${name} switch has no knob`);
  }
  return knob;
}

function tickOf(name: string): "shown" | "hidden" | "absent" {
  const tick = knobOf(name).querySelector("svg");
  if (tick === null) {
    return "absent";
  }
  return getComputedStyle(tick).display === "none" ? "hidden" : "shown";
}

async function renderPair(platform: Platform): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await render(Switch, { checked: true, "aria-label": "On" });
  await render(Switch, { checked: false, "aria-label": "Off" });
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  followDisplayModes({ contrast: undefined, transparency: undefined });
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} switch at its own size`, async () => {
    await renderPair(look.platform);

    const track = trackOf("Off").getBoundingClientRect();
    const knobOff = knobOf("Off").getBoundingClientRect();
    const knobOn = knobOf("On").getBoundingClientRect();

    expect(track.width).toBeCloseTo(look.track[0], 0);
    expect(track.height).toBeCloseTo(look.track[1], 0);
    expect(knobOff.width).toBeCloseTo(look.knobOff, 0);
    expect(knobOn.width).toBeCloseTo(look.knobOn, 0);
  });

  test(`colours the ${look.platform} switch's track, edge and knob`, async () => {
    await renderPair(look.platform);

    const off = getComputedStyle(trackOf("Off"));
    const on = getComputedStyle(trackOf("On"));

    expect(off.backgroundColor).toBe(
      resolvedColour(look.trackOff, "backgroundColor"),
    );
    expect(on.backgroundColor).toBe(
      resolvedColour(look.trackOn, "backgroundColor"),
    );
    expect(off.borderTopColor).toBe(resolvedColour(look.edgeOff, "color"));
    expect(getComputedStyle(knobOf("Off")).backgroundColor).toBe(
      resolvedColour(look.knobOffFill, "backgroundColor"),
    );
  });
}

test("ticks the knob of a switched-on Android switch, and only that one", async () => {
  await renderPair("android");

  expect([tickOf("On"), tickOf("Off")]).toEqual(["shown", "hidden"]);
});

test("leaves the knob of a switched-on Linux switch unticked", async () => {
  await renderPair("linux");

  expect(tickOf("On")).toBe("hidden");
});

test("draws the iOS knob as a capsule, wider than it is tall", async () => {
  await renderPair("ios");

  const knob = knobOf("Off").getBoundingClientRect();

  expect(knob.width).toBeCloseTo(37, 0);
  expect(knob.height).toBeCloseTo(24, 0);
});

test.each([
  { theme: "light", track: "rgb(0, 137, 50)" },
  { theme: "dark", track: "rgb(74, 217, 104)" },
])(
  "darkens the iOS switch's green under Increase Contrast in $theme",
  async ({ theme, track }) => {
    await renderPair("ios");
    document.documentElement.dataset.theme = theme;

    followDisplayModes({ contrast: "more", transparency: undefined });

    expect(getComputedStyle(trackOf("On")).backgroundColor).toBe(track);
  },
);

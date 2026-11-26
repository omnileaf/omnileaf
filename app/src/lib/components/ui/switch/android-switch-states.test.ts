import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Switch from "./switch.svelte";

type Theme = "light" | "dark";

interface KitSwitchColours {
  readonly focusRing: string;
  readonly thumbOn: string;
  readonly thumbOnFocused: string;
}

const KIT: Record<Theme, KitSwitchColours> = {
  light: {
    focusRing: "rgb(78, 100, 86)",
    thumbOn: "rgb(230, 255, 237)",
    thumbOnFocused: "rgb(180, 240, 203)",
  },
  dark: {
    focusRing: "rgb(180, 204, 187)",
    thumbOn: "rgb(0, 57, 29)",
    thumbOnFocused: "rgb(50, 91, 68)",
  },
};

const THEMES: readonly Theme[] = ["light", "dark"];

function rootOf(name: string): HTMLElement {
  const root = page.getByRole("switch", { name }).element();
  if (!(root instanceof HTMLElement)) {
    throw new Error(`the ${name} switch drew no element`);
  }
  return root;
}

function trackOf(name: string): HTMLElement {
  const track = rootOf(name).querySelector(
    "[data-switch-thumb]",
  )?.parentElement;
  if (track === null || track === undefined) {
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

async function renderSwitch(
  platform: Platform,
  theme: Theme,
  checked: boolean,
): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await render(Switch, { checked, "aria-label": "Keep the screen on" });
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

for (const theme of THEMES) {
  const kit = KIT[theme];

  test(`rings a focused Android switch's track in the focus colour, 3px out by 2px, in the ${theme} theme`, async () => {
    await renderSwitch("android", theme, false);

    await userEvent.tab();
    await expect.element(rootOf("Keep the screen on")).toHaveFocus();
    const track = getComputedStyle(trackOf("Keep the screen on"));

    expect(getComputedStyle(rootOf("Keep the screen on")).outlineStyle).toBe(
      "none",
    );
    expect(track.outlineStyle).toBe("solid");
    expect(track.outlineWidth).toBe("3px");
    expect(track.outlineOffset).toBe("2px");
    expect(track.outlineColor).toBe(kit.focusRing);
  });

  test(`lightens a focused, switched-on Android switch's thumb to the accent container in the ${theme} theme`, async () => {
    await renderSwitch("android", theme, true);
    const rest = getComputedStyle(knobOf("Keep the screen on")).backgroundColor;

    await userEvent.tab();
    await expect.element(rootOf("Keep the screen on")).toHaveFocus();

    expect(rest).toBe(kit.thumbOn);
    expect(getComputedStyle(knobOf("Keep the screen on")).backgroundColor).toBe(
      kit.thumbOnFocused,
    );
  });
}

test("keeps a focused iOS switch's track unringed", async () => {
  await renderSwitch("ios", "light", true);

  await userEvent.tab();
  await expect.element(rootOf("Keep the screen on")).toHaveFocus();

  expect(getComputedStyle(trackOf("Keep the screen on")).outlineStyle).toBe(
    "none",
  );
  expect(getComputedStyle(knobOf("Keep the screen on")).backgroundColor).toBe(
    "oklch(1 0 0)",
  );
});

test("leaves a switch drawn as a whole row to ring the row, not the track", async () => {
  followCorePlatform("android");
  document.documentElement.dataset.theme = "light";
  await render(Switch, {
    "aria-label": "Skip this screen",
    class: "focus-visible:outline-2 focus-visible:outline-accent",
    children: createRawSnippet(() => ({
      render: () => "<span>Skip this screen</span>",
    })),
  });

  await userEvent.tab();
  await expect.element(rootOf("Skip this screen")).toHaveFocus();

  expect(getComputedStyle(rootOf("Skip this screen")).outlineStyle).toBe(
    "solid",
  );
  expect(getComputedStyle(trackOf("Skip this screen")).outlineStyle).toBe(
    "none",
  );
});

import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SheetHarness from "./SheetHarness.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

test.each<{ platform: Platform; duration: string; ease: string }>([
  {
    platform: "windows",
    duration: "0.25s",
    ease: "cubic-bezier(0, 0, 0, 1)",
  },
  {
    platform: "linux",
    duration: "0.35s",
    ease: "cubic-bezier(0.32, 0.72, 0, 1)",
  },
])(
  "slides a side pane in over $duration on $platform",
  async ({ platform, duration, ease }) => {
    followCorePlatform(platform);
    await render(SheetHarness);
    const pane = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(pane).toBeVisible();

    const drawn = getComputedStyle(pane.element());

    expect([drawn.transitionDuration, drawn.transitionTimingFunction]).toEqual([
      duration,
      ease,
    ]);
  },
);

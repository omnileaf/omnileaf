import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../tests/components/resolved-colour";
import FocusRingHarness from "./FocusRingHarness.svelte";

interface FocusRing {
  readonly platform: Platform;
  readonly width: string;
  readonly offset: string;
  readonly colour: string;
}

const RINGS: readonly FocusRing[] = [
  { platform: "linux", width: "2px", offset: "2px", colour: "--primary" },
  {
    platform: "android",
    width: "3px",
    offset: "2px",
    colour: "--foreground",
  },
  {
    platform: "ios",
    width: "3px",
    offset: "0px",
    colour: "color-mix(in oklch, var(--primary) 45%, transparent)",
  },
  {
    platform: "macos",
    width: "3px",
    offset: "0px",
    colour: "color-mix(in oklch, var(--primary) 50%, transparent)",
  },
  {
    platform: "windows",
    width: "2px",
    offset: "1px",
    colour: "--foreground",
  },
];

const CONTROLS = [
  page.getByRole("button", { name: "Add a folder" }),
  page.getByRole("checkbox", { name: "Mark read" }),
  page.getByRole("slider", { name: "Brightness" }),
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const ring of RINGS) {
  test(`rings each shared control the ${ring.platform} way when the keyboard reaches it`, async () => {
    document.documentElement.dataset.platform = ring.platform;
    document.documentElement.dataset.theme = "light";
    await render(FocusRingHarness);

    for (const control of CONTROLS) {
      await userEvent.tab();
      await expect.element(control).toHaveFocus();
      const style = getComputedStyle(control.element());

      expect(style.outlineStyle).toBe("solid");
      expect(style.outlineWidth).toBe(ring.width);
      expect(style.outlineOffset).toBe(ring.offset);
      expect(style.outlineColor).toBe(
        resolvedColour(ring.colour, "outlineColor"),
      );
    }
  });
}

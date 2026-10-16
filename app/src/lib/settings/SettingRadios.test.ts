import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import SettingRadios from "./SettingRadios.svelte";

interface RadioLook {
  readonly platform: Platform;
  readonly size: number;
  readonly dot: number;
  readonly edgeWidth: string;
  readonly edgeOff: string;
  readonly edgeOn: string;
}

const LOOKS: readonly RadioLook[] = [
  {
    platform: "linux",
    size: 16,
    dot: 8,
    edgeWidth: "1px",
    edgeOff: "--input",
    edgeOn: "--input",
  },
  {
    platform: "android",
    size: 20,
    dot: 10,
    edgeWidth: "2px",
    edgeOff: "--android-outline",
    edgeOn: "--primary",
  },
  {
    platform: "ios",
    size: 16,
    dot: 8,
    edgeWidth: "1px",
    edgeOff: "--input",
    edgeOn: "--input",
  },
  {
    platform: "macos",
    size: 16,
    dot: 8,
    edgeWidth: "1px",
    edgeOff: "--input",
    edgeOn: "--input",
  },
  {
    platform: "windows",
    size: 16,
    dot: 8,
    edgeWidth: "1px",
    edgeOff: "--input",
    edgeOn: "--input",
  },
];

function ringOf(name: string): HTMLElement {
  const ring = page
    .getByRole("radio", { name })
    .element()
    .querySelector<HTMLElement>(":scope > span[aria-hidden]");
  if (ring === null) {
    throw new Error(`the ${name} radio has no ring`);
  }
  return ring;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} radio at its own size and edge`, async () => {
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(SettingRadios, {
      title: "Time format",
      options: ["clock", "words"],
      labels: { clock: "Clock", words: "Words" },
      chosen: "clock",
      onChoose: () => undefined,
    });

    const chosen = ringOf("Clock");
    const other = ringOf("Words");
    const dot = chosen.firstElementChild;

    expect(chosen.getBoundingClientRect().width).toBeCloseTo(look.size, 0);
    expect(dot?.getBoundingClientRect().width).toBeCloseTo(look.dot, 0);
    expect(getComputedStyle(chosen).borderTopWidth).toBe(look.edgeWidth);
    expect(getComputedStyle(chosen).borderTopColor).toBe(
      resolvedColour(look.edgeOn, "color"),
    );
    expect(getComputedStyle(other).borderTopColor).toBe(
      resolvedColour(look.edgeOff, "color"),
    );
  });
}

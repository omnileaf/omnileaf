import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import BadgeHarness from "./BadgeHarness.svelte";

const CORNERS: readonly (readonly [Platform, string])[] = [
  ["linux", "8px"],
  ["android", "8px"],
  ["ios", "9999px"],
  ["macos", "8px"],
  ["windows", "8px"],
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

for (const [platform, corner] of CORNERS) {
  test(`rounds ${platform}'s label badges to ${corner}`, async () => {
    document.documentElement.dataset.platform = platform;
    await render(BadgeHarness);

    const corners = ["New", "Harbour"].map(
      (label) =>
        getComputedStyle(page.getByText(label).element()).borderTopLeftRadius,
    );

    expect(corners).toEqual([corner, corner]);
  });
}

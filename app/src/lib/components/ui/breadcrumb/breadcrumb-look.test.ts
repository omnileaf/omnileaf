import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import BreadcrumbHarness from "./BreadcrumbHarness.svelte";

interface CrumbsDrawn {
  readonly chevron: number;
  readonly chevronSides: string;
  readonly gap: string;
}

async function crumbsOn(platform: Platform): Promise<CrumbsDrawn> {
  followCorePlatform(platform);
  await render(BreadcrumbHarness);
  const trail = page
    .getByRole("navigation", { name: "Where this series sits" })
    .element();
  const list = trail.querySelector("ol");
  const separator = trail.querySelector("[role='presentation']");
  const chevron = separator?.querySelector("svg");
  if (
    list === null ||
    separator === null ||
    chevron === null ||
    chevron === undefined
  ) {
    throw new Error("the breadcrumb drew no list, separator or chevron");
  }
  return {
    chevron: chevron.getBoundingClientRect().width,
    chevronSides: getComputedStyle(separator).marginInline,
    gap: getComputedStyle(list).columnGap,
  };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("names the trail and marks the page it ends on, on every platform", async () => {
  for (const platform of ["linux", "macos", "windows"] as const) {
    followCorePlatform(platform);
    const screen = await render(BreadcrumbHarness);

    await expect
      .element(
        screen.getByRole("navigation", { name: "Where this series sits" }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText("Sample Series 04"))
      .toHaveAttribute("aria-current", "page");
    await screen.unmount();
  }
});

test("parts Windows's BreadcrumbBar with a 12 chevron, 2 each side", async () => {
  const drawn = await crumbsOn("windows");

  expect(drawn).toEqual({ chevron: 12, chevronSides: "2px", gap: "0px" });
});

test("keeps today's 14 chevron and roomy gap off Windows", async () => {
  const drawn = await crumbsOn("linux");

  expect(drawn).toEqual({ chevron: 14, chevronSides: "0px", gap: "10px" });
});

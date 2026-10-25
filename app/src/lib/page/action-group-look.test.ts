import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import ActionGroupHarness from "./ActionGroupHarness.svelte";
import { followCorePlatform } from "./platform";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

async function actionsOn(
  platform: Platform,
  window: { readonly width: number; readonly height: number },
): Promise<[DOMRect, DOMRect]> {
  await page.viewport(window.width, window.height);
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await render(ActionGroupHarness);
  return [
    page
      .getByRole("link", { name: "Back to the series" })
      .element()
      .getBoundingClientRect(),
    page
      .getByRole("button", { name: "Show the file" })
      .element()
      .getBoundingClientRect(),
  ];
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("stacks iOS's actions as large capsules sharing the wider one's width, 12 apart", async () => {
  const [main, other] = await actionsOn("ios", PHONE);

  expect(main.height).toBeCloseTo(50, 0);
  expect(other.height).toBeCloseTo(50, 0);
  expect(main.width).toBeCloseTo(other.width, 0);
  expect(other.top - main.bottom).toBeCloseTo(12, 0);
});

test("stacks Android's actions at their own width, centred, 8 apart", async () => {
  const [main, other] = await actionsOn("android", PHONE);

  expect(main.height).toBeCloseTo(40, 0);
  expect(main.width).not.toBeCloseTo(other.width, 0);
  expect(main.left + main.width / 2).toBeCloseTo(
    other.left + other.width / 2,
    0,
  );
  expect(other.top - main.bottom).toBeCloseTo(8, 0);
});

test("keeps today's actions on an iPad", async () => {
  const [main] = await actionsOn("ios", TABLET);

  expect(main.height).not.toBeCloseTo(50, 0);
});

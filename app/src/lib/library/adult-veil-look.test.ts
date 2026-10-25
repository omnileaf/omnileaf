import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import AdultVeil from "./AdultVeil.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

async function veilOn(
  platform: Platform,
  window: { readonly width: number; readonly height: number },
): Promise<{ veil: CSSStyleDeclaration; mark: CSSStyleDeclaration }> {
  await page.viewport(window.width, window.height);
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await render(AdultVeil, { onPointer: false });
  const label = page.getByText("18+").element();
  const veil = label.parentElement;
  const mark = veil?.firstElementChild;
  if (veil === null || mark === null || mark === undefined) {
    throw new Error("the veil drew no mark");
  }
  return { veil: getComputedStyle(veil), mark: getComputedStyle(mark) };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test.each<Platform>(["ios", "android"])(
  "dims the whole cover on %s phones, with white words and a plain mark",
  async (platform) => {
    const { veil, mark } = await veilOn(platform, PHONE);

    expect(veil.color).toBe("rgb(255, 255, 255)");
    expect(mark.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  },
);

test("keeps today's veil on an iPad", async () => {
  const { veil, mark } = await veilOn("ios", TABLET);

  expect(veil.color).not.toBe("rgb(255, 255, 255)");
  expect(mark.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

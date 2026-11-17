import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import type { AutoScrollSpeed } from "./auto-scroll.ts";
import AutoScrollBarHarness from "./AutoScrollBarHarness.svelte";

interface Viewport {
  readonly width: number;
  readonly height: number;
}

const PHONE: Viewport = { width: 390, height: 844 };
const WIDE_ANDROID: Viewport = { width: 900, height: 600 };
const THREE_SCREENS: AutoScrollSpeed = { kind: "set", screensPerMinute: 3 };
const MY_PACE: AutoScrollSpeed = { kind: "myPace", pagesPerMinute: 2 };

interface Bar {
  readonly platform: Platform;
  readonly speed: AutoScrollSpeed;
  readonly viewport?: Viewport;
  readonly onSpeed?: (event: MouseEvent) => void;
}

async function openBar({
  platform,
  speed,
  viewport = PHONE,
  onSpeed = () => undefined,
}: Bar): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  await page.viewport(viewport.width, viewport.height);
  await render(AutoScrollBarHarness, { platform, speed, onSpeed });
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("names the Android readout after the speed it sets", async () => {
  await openBar({ platform: "android", speed: THREE_SCREENS });

  await expect
    .element(
      page.getByRole("button", {
        name: "Auto scroll speed, 3 screens a minute",
      }),
    )
    .toBeVisible();
});

test("says one screen a minute in the Android readout's name", async () => {
  await openBar({
    platform: "android",
    speed: { kind: "set", screensPerMinute: 1 },
  });

  await expect
    .element(
      page.getByRole("button", {
        name: "Auto scroll speed, 1 screen a minute",
      }),
    )
    .toBeVisible();
});

test("opens the speed from a tap on the Android readout", async () => {
  const onSpeed = vi.fn<(event: MouseEvent) => void>();
  await openBar({ platform: "android", speed: THREE_SCREENS, onSpeed });

  await page.getByRole("button", { name: /^Auto scroll speed/ }).click();

  expect(onSpeed).toHaveBeenCalledOnce();
});

test("leaves the Android readout plain at my pace", async () => {
  await openBar({ platform: "android", speed: MY_PACE });

  await expect
    .element(page.getByRole("region", { name: "Auto scroll" }))
    .toBeVisible();
  expect(
    page.getByRole("button", { name: /^Auto scroll speed/ }).elements(),
  ).toHaveLength(0);
});

test("leaves the Android readout plain wider than a phone", async () => {
  await openBar({
    platform: "android",
    speed: THREE_SCREENS,
    viewport: WIDE_ANDROID,
  });

  await expect
    .element(page.getByRole("region", { name: "Auto scroll" }))
    .toBeVisible();
  expect(
    page.getByRole("button", { name: /^Auto scroll speed/ }).elements(),
  ).toHaveLength(0);
});

test("leaves the iPhone readout plain", async () => {
  await openBar({ platform: "ios", speed: THREE_SCREENS });

  await expect
    .element(page.getByRole("region", { name: "Auto scroll" }))
    .toBeVisible();
  expect(
    page.getByRole("button", { name: /^Auto scroll speed/ }).elements(),
  ).toHaveLength(0);
});

import type { Page, TestInfo } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn } from "./screens.ts";
import {
  historyPlaceOf,
  libraryShown,
  mainOf,
  pathOf,
  placeAfterAPlainBack,
  scrollLibraryDown,
  SETTINGS_TOP,
  tabOf,
} from "./tap-open-tab.ts";

interface Look {
  readonly name: string;
  readonly platform: Platform;
  readonly project: string;
  readonly settingsOpensOn: string;
}

const LOOKS: readonly Look[] = [
  {
    name: "an Android tablet",
    platform: "android",
    project: "chromium-tablet",
    settingsOpensOn: SETTINGS_TOP,
  },
  {
    name: "an iPad",
    platform: "ios",
    project: "webkit-tablet",
    settingsOpensOn: SETTINGS_TOP,
  },
  {
    name: "Windows",
    platform: "windows",
    project: "chromium-desktop",
    settingsOpensOn: "/settings/general",
  },
  {
    name: "macOS",
    platform: "macos",
    project: "webkit-desktop",
    settingsOpensOn: "/settings/general",
  },
  {
    name: "Linux",
    platform: "linux",
    project: "webkit-desktop",
    settingsOpensOn: "/settings/general",
  },
];

async function openSeriesWithTheKeyboard(page: Page): Promise<void> {
  await mainOf(page)
    .locator("a[href^='/series/']:not([inert] a)")
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => pathOf(page)).toMatch(/^\/series\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function onlyWhereItIsDrawn(look: Look, testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name !== look.project,
    `${look.name} is drawn in ${look.project}`,
  );
}

for (const look of LOOKS) {
  test.describe(`activating the current navigation item on ${look.name}`, () => {
    test.use({ backend: sampleLibraryOn(look.platform) });

    test("goes back to the Library from a series opened in it, as a plain back does", async ({
      page,
    }, testInfo) => {
      onlyWhereItIsDrawn(look, testInfo);
      await page.goto("/");
      await libraryShown(page);
      const atTheLibrary = await historyPlaceOf(page);
      await openSeriesWithTheKeyboard(page);
      const afterABack = placeAfterAPlainBack(
        await historyPlaceOf(page),
        atTheLibrary,
      );

      await tabOf(page, "Library").click();

      await expect.poll(() => pathOf(page)).toBe("/");
      await libraryShown(page);
      expect(await historyPlaceOf(page)).toEqual(afterABack);
    });

    test("goes to where Settings opens from Settings › Reader", async ({
      page,
    }, testInfo) => {
      onlyWhereItIsDrawn(look, testInfo);
      await page.goto("/settings/reading");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await tabOf(page, "Settings").click();

      await expect.poll(() => pathOf(page)).toBe(look.settingsOpensOn);
    });

    test("opens the scrolled Library again in place, as any link to it does", async ({
      page,
    }, testInfo) => {
      onlyWhereItIsDrawn(look, testInfo);
      await page.goto("/");
      await libraryShown(page);
      await scrollLibraryDown(page);
      const before = await historyPlaceOf(page);

      await tabOf(page, "Library").click();

      await expect
        .poll(async () => (await historyPlaceOf(page)).state)
        .not.toBe(before.state);
      const after = await historyPlaceOf(page);
      expect(pathOf(page)).toBe("/");
      expect([after.length, after.index]).toEqual([
        before.length,
        before.index,
      ]);
    });
  });
}

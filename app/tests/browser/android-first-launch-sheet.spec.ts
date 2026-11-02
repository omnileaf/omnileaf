import type { Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  setTextScale,
  sidewaysOverflow,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const HOME = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "Internal storage › Documents › Omnileaf",
  isAvailable: true,
} as const;

const LARGE_TEXT_SCALE = 1.3;
const SHEET_TITLE_SIZE = "22px";
const SHEET_TITLE_WEIGHT = "400";
const SHEET_BODY_SIZE = "14px";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({ folders: [HOME], next: null }),
  },
});

async function openThePickFolderSheet(page: Page) {
  await page.goto("/first-launch");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add a folder" }).click();
  const sheet = page.getByRole("alertdialog", { name: "Pick a folder" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

test.describe(
  "the pick a folder sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's bottom sheet");
    });

    test("opens as a bottom sheet with a drag handle and no badge beside the title", async ({
      page,
    }) => {
      const sheet = await openThePickFolderSheet(page);

      const box = await boxOf(sheet);

      expect(box.y + box.height).toBe(viewportOf(page).height);
      await expect(
        sheet.getByRole("heading", { name: "Pick a folder" }),
      ).toBeVisible();
      await expect(sheet.locator("svg")).toHaveCount(0);
    });

    test("sets the title at 22px in regular weight", async ({ page }) => {
      const sheet = await openThePickFolderSheet(page);
      const title = sheet.getByRole("heading", { name: "Pick a folder" });

      await expect(title).toHaveCSS("font-size", SHEET_TITLE_SIZE);
      await expect(title).toHaveCSS("font-weight", SHEET_TITLE_WEIGHT);
    });

    test("sets what Android will ask at 14px in the muted colour", async ({
      page,
    }) => {
      const sheet = await openThePickFolderSheet(page);
      const body = sheet.getByText(/^Android shows its folder picker next/);

      await expect(body).toHaveCSS("font-size", SHEET_BODY_SIZE);
      await expect(body).toHaveCSS(
        "color",
        await tokenColour(page, "--color-muted"),
      );
    });

    test("fills Continue in the accent and sets Not now as a plain text button", async ({
      page,
    }) => {
      const sheet = await openThePickFolderSheet(page);

      await expect(sheet.getByRole("button", { name: "Continue" })).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-button-primary"),
      );
      await expect(sheet.getByRole("button", { name: "Not now" })).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
    });

    test("keeps both buttons on screen at large text", async ({ page }) => {
      await setTextScale(page, LARGE_TEXT_SCALE);
      const sheet = await openThePickFolderSheet(page);

      const notNow = await boxOf(
        sheet.getByRole("button", { name: "Not now" }),
      );

      expect(notNow.y + notNow.height).toBeLessThanOrEqual(
        viewportOf(page).height,
      );
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  },
);

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
} from "./fixtures.ts";

const EMPTY_LIBRARY = "Your library is empty";

const PLACES = [
  { place: "the empty library", path: "/", region: EMPTY_LIBRARY },
  { place: "Settings › Library", path: "/settings/library", region: "Folders" },
] as const;

function addFolderIn(page: Page, region: string) {
  return page
    .getByRole("region", { name: region })
    .getByRole("button", { name: "Add a folder" });
}

test.describe("with a folder of comics", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: () => ({
        name: "Sample Library",
        comicFiles: 3,
        unreadableFolders: 0,
      }),
    },
  });

  for (const { place, path, region } of PLACES) {
    test(`adds a folder from ${place} and reports the comics in it`, async ({
      page,
    }) => {
      await page.goto(path);

      await addFolderIn(page, region).click();

      await expect(page.getByRole("status")).toHaveText(
        "Found 3 comics in Sample Library.",
      );
    });
  }

  test("lets the notice under the folders be dismissed", async ({ page }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const status = page.getByRole("status");
    await expect(status).toHaveText("Found 3 comics in Sample Library.");

    await status.getByRole("button", { name: "Dismiss" }).click();

    await expect(status).toBeEmpty();
  });
});

test("opens Settings › Library from Settings", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("main").getByRole("link", { name: "Library" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { level: 2, name: "Folders" }),
  ).toBeVisible();
});

for (const { platform, buttonHeight } of [
  { platform: "linux", buttonHeight: 36 },
  { platform: "android", buttonHeight: 48 },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test(`puts a ${String(buttonHeight)}px Add a folder at the end of the Folders heading`, async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const folders = page.getByRole("region", { name: "Folders" });

      const region = await boxOf(folders);
      const heading = await boxOf(
        folders.getByRole("heading", { level: 2, name: "Folders" }),
      );
      const button = await boxOf(
        folders.getByRole("button", { name: "Add a folder" }),
      );

      expect(button.height).toBe(buttonHeight);
      expect(button.x + button.width).toBe(region.x + region.width);
      expect(button.y).toBeLessThan(heading.y + heading.height);
      expect(button.y + button.height).toBeGreaterThan(heading.y);
    });
  });
}

test.describe("with a folder it can't read", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: () => {
        throw new CommandFailure({
          code: "folderUnreadable",
          message: "the folder could not be read",
        });
      },
    },
  });

  test("explains that the folder couldn't be read", async ({ page }) => {
    await page.goto("/");

    await addFolderIn(page, EMPTY_LIBRARY).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Couldn't read that folder.",
    );
  });
});

test.describe("where the folder picker is unavailable", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: () => {
        throw new CommandFailure({
          code: "folderPickerUnavailable",
          message: "the folder picker is unavailable",
        });
      },
    },
  });

  for (const { place, path, region } of PLACES) {
    test(`keeps the Add a folder button its size in ${place} when the outcome shows`, async ({
      page,
    }) => {
      await page.goto(path);
      const button = addFolderIn(page, region);
      const before = await boxOf(button);

      await button.click();

      await expect(page.getByRole("alert")).toHaveText(
        "Adding folders isn't available on this device yet.",
      );
      expect((await boxOf(button)).width).toBe(before.width);
    });
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Settings › Library has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings/library");
    await expect(
      page.getByRole("heading", { level: 2, name: "Folders" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}

import { AxeBuilder } from "@axe-core/playwright";

import { CommandFailure } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

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

  for (const { place, path } of [
    { place: "the empty library", path: "/" },
    { place: "Settings › Library", path: "/settings/library" },
  ]) {
    test(`adds a folder from ${place} and reports the comics in it`, async ({
      page,
    }) => {
      await page.goto(path);

      await page.getByRole("button", { name: "Add a folder" }).click();

      await expect(page.getByRole("status")).toHaveText(
        "Found 3 comics in Sample Library.",
      );
    });
  }
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

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Couldn't read that folder.",
    );
  });
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

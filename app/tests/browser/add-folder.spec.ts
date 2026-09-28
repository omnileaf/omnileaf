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

  test("adds a folder and reports the comics in it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Found 3 comics in Sample Library.",
    );
  });
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

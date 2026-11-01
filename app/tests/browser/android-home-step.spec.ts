import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({
      folders: [
        {
          id: "1",
          kind: "home",
          name: "Omnileaf",
          location: "/storage/emulated/0/Documents/Omnileaf",
          isAvailable: true,
        },
      ],
      next: null,
    }),
  },
});

test.describe(
  "the home folder step on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list items");
    });

    test("lists what the home folder keeps as two-line items, the name at 16px over its line at 14px", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Get started" }).click();
      const term = page.getByText("Keeps", { exact: true });
      const detail = page.getByText("Progress, categories and backups");

      await expect(term).toHaveCSS("font-size", "16px");
      await expect(detail).toHaveCSS("font-size", "14px");
      await expect(detail).toHaveCSS("line-height", "20px");
      const termBox = await term.boundingBox();
      const detailBox = await detail.boundingBox();
      expect(detailBox?.y ?? 0).toBeGreaterThan(
        (termBox?.y ?? 0) + (termBox?.height ?? 0) - 1,
      );
    });

    test("sets the path in monospace as plain text under the name, with no chip", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Get started" }).click();
      const path = page.locator("code", { hasText: "/storage/emulated/0" });

      await expect(path).toHaveCSS("border-top-width", "0px");
      await expect(path).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });
  },
);

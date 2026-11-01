import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
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

test.describe("Add a folder on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("is a flat list row with a plus, 56px tall, in regular weight, with no outline", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const add = page.getByRole("button", { name: "Add a folder" });

    await expect(add).toHaveCSS("border-top-width", "0px");
    await expect(add).toHaveCSS("font-weight", "400");
    await expect(add).toHaveCSS("font-size", "16px");
    expect((await boxOf(add)).height).toBeGreaterThanOrEqual(56);
    expect((await boxOf(add)).x).toBeLessThanOrEqual(1);
  });
});

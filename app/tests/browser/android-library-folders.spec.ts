import type { FakeBackend } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const FOLDERS: WireFolder[] = [
  {
    id: "1",
    kind: "home",
    name: "Omnileaf",
    location: "/storage/emulated/0/Documents/Omnileaf",
    isAvailable: true,
  },
  {
    id: "2",
    kind: "linked",
    name: "Comics",
    location: "/storage/emulated/0/Comics",
    isAvailable: true,
  },
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryFolders: () => ({ folders: [...FOLDERS], next: null }),
    libraryFolderBookCount: () => 12,
  },
});

test.describe(
  "Settings › Library on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("sets the home folder as a flat row, a 16px name over its path", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const section = page.getByRole("region", { name: "Home folder" });
      const name = section.getByRole("heading", { name: "Home folder" });

      await expect(section.locator("> div").first()).toHaveCSS(
        "border-top-width",
        "0px",
      );
      await expect(name).toHaveCSS("font-size", "16px");
      await expect(name).toHaveCSS("font-weight", "400");
      await expect(section.locator("code")).toHaveCSS("font-size", "14px");
    });

    test("heads Folders in the accent and runs each folder row edge to edge", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const heading = page.getByRole("heading", { name: "Folders" });
      const row = page.getByRole("listitem").filter({ hasText: "Comics" });

      await expect(heading).toHaveCSS("font-size", "14px");
      expect((await boxOf(row)).x).toBeLessThanOrEqual(1);
      await expect(row).toHaveCSS("border-top-width", "0px");
    });
  },
);

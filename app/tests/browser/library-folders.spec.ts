import { AxeBuilder } from "@axe-core/playwright";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

type WireFolder = ReturnType<FakeBackend["libraryFolders"]>["folders"][number];

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
};
const SAMPLE_COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
};
const SAMPLE_LIBRARY: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Sample Library",
  location: "/media/Sample Library",
};

/** A library that keeps what each test adds, set back before the next test. */
class SampleLibrary {
  folders: WireFolder[] = [];

  reset(): void {
    this.folders = [HOME, SAMPLE_COMICS];
  }
}

const library = new SampleLibrary();

const LIBRARY_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({ folders: [...library.folders], next: null }),
  addLibraryFolder: () => {
    library.folders.push(SAMPLE_LIBRARY);
    return { name: SAMPLE_LIBRARY.name, comicFiles: 3, unreadableFolders: 0 };
  },
};

test.use({ backend: LIBRARY_BACKEND });

test.beforeEach(() => {
  library.reset();
});

test("shows the home folder and the linked folders in Settings › Library", async ({
  page,
}) => {
  await page.goto("/settings/library");

  await expect(page.getByRole("region", { name: "Home folder" })).toContainText(
    "Omnileaf /data/Omnileaf",
  );
  await expect(
    page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
  ).toHaveText(["Sample Comics /media/Sample Comics"]);
});

test("lists a folder as soon as it is added", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  await expect(folders.getByRole("listitem")).toHaveCount(1);

  await folders.getByRole("button", { name: "Add a folder" }).click();

  await expect(folders.getByRole("listitem")).toHaveText([
    "Sample Comics /media/Sample Comics",
    "Sample Library /media/Sample Library",
  ]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the folder list has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings/library");
    await expect(
      page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
    ).toHaveCount(1);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}

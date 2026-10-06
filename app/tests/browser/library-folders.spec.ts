import { AxeBuilder } from "@axe-core/playwright";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

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
    return {
      name: SAMPLE_LIBRARY.name,
      series: 3,
      books: 7,
      unreadableBooks: 0,
      unreadableFolders: 0,
    };
  },
  removeLibraryFolder: (id) => {
    library.folders = library.folders.filter((folder) => folder.id !== id);
    return null;
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

test("shows Remove as an icon with its verb as the tooltip", async ({
  page,
}) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });

  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });

  await expect(remove).toHaveText("");
  await expect(remove).toHaveAttribute("title", "Remove");
});

test("rings Remove when the keyboard reaches it", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await expect(remove).toBeVisible();
  await folders.getByRole("button", { name: "Add a folder" }).focus();

  await page.keyboard.press("Tab");

  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS("outline-style", "solid");
});

test("removes a folder once the removal is confirmed", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Remove Sample Comics?",
  });

  await dialog.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect(dialog).toBeHidden();
  await expect(folders.getByRole("listitem")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: "Folders" }),
  ).toBeFocused();
});

test("keeps a folder when the removal is dismissed with Escape", async ({
  page,
}) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await remove.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(folders.getByRole("listitem")).toHaveCount(1);
  await expect(remove).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the removal question has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Remove Sample Comics" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

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

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
  isAvailable: true,
};
const SAMPLE_COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};
const SAMPLE_LIBRARY: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Sample Library",
  location: "/media/Sample Library",
  isAvailable: true,
};

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
      unsupportedBooks: 0,
      unreadableFolders: 0,
    };
  },
  removeLibraryFolder: (id) => {
    library.folders = library.folders.filter((folder) => folder.id !== id);
    return null;
  },
  libraryFolderBookCount: () => 342,
};

const UNDO_WINDOW_MS = 10_000;

test.use({ backend: LIBRARY_BACKEND });

test.beforeEach(() => {
  library.reset();
});

test("shows the home folder and the linked folders in Settings › Library", async ({
  page,
}) => {
  await page.goto("/settings/library");

  await expect(page.getByRole("region", { name: "Home folder" })).toContainText(
    "Home folder /data/Omnileaf",
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

test('shows Remove as an icon with "Remove folder" as the tooltip', async ({
  page,
}) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });

  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });

  await expect(remove).toHaveText("");
  await remove.hover();
  await expect(remove).toHaveAccessibleDescription("Remove folder");
  await expect(remove).not.toHaveAttribute("title");
});

test("rings Remove when the keyboard reaches it", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await expect(remove).toBeVisible();
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).focus();

  await page.keyboard.press("Tab");

  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS("outline-style", "solid");
});

test("removes a folder at once and offers to undo it", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect(folders.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Sample Comics removed" }),
  ).toContainText("Its files stay where they are.");
  await expect(
    page.getByRole("heading", { level: 2, name: "Folders" }),
  ).toBeFocused();
  expect(library.folders).toContain(SAMPLE_COMICS);
});

test("brings the folder back with Undo", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(folders.getByRole("listitem")).toHaveCount(1);
  expect(library.folders).toContain(SAMPLE_COMICS);
});

test("shares one bar and one Undo between removals in quick succession", async ({
  page,
}) => {
  library.folders = [HOME, SAMPLE_COMICS, SAMPLE_LIBRARY];
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
  await folders.getByRole("button", { name: "Remove Sample Library" }).click();
  const bar = page.getByRole("listitem").filter({ hasText: "2 removed" });
  await expect(bar).toContainText(
    "Sample Comics and Sample Library. Their files stay where they are.",
  );
  await bar.getByRole("button", { name: "Undo" }).click();

  await expect(folders.getByRole("listitem")).toHaveCount(2);
  expect(library.folders).toHaveLength(3);
});

test("removes the folder for good once Undo lapses", async ({ page }) => {
  await page.clock.install();
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
  await expect(folders.getByRole("listitem")).toHaveCount(0);

  await page.clock.runFor(UNDO_WINDOW_MS);

  await expect.poll(() => library.folders).not.toContain(SAMPLE_COMICS);
  await expect(folders.getByRole("listitem")).toHaveCount(0);
});

test.describe("on a desktop", () => {
  test.skip(({ isMobile }) => isMobile, "keyboards only");

  test("brings the folder back with Ctrl Z", async ({ page }) => {
    await page.goto("/settings/library");
    const folders = page.getByRole("region", { name: "Folders" });
    await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
    await expect(folders.getByRole("listitem")).toHaveCount(0);

    await page.keyboard.press("Control+z");

    await expect(folders.getByRole("listitem")).toHaveCount(1);
  });
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

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("on iOS", () => {
  testOnlyInItsWebview("ios");
  test.use({ backend: { ...LIBRARY_BACKEND, ...onPlatform("ios").backend } });

  test("sets Settings › Library on the grouped ground with its cards as cells", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const folders = page.getByRole("region", { name: "Folders" });
    await expect(folders).toBeVisible();

    await expect(page.locator("[data-ground=grouped]")).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-grouped-ground"),
    );
    await expect(folders.locator("> div").first()).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
  });
});

test.describe("in a narrow window", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("puts Change and Rescan on a line of their own under the home folder", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const home = page.getByRole("region", { name: "Home folder" });
    const path = await home.getByText("/data/Omnileaf").boundingBox();
    const change = await home
      .getByRole("button", { name: "Change" })
      .boundingBox();
    const rescan = await home
      .getByRole("button", { name: /^Rescan / })
      .boundingBox();

    expect(path).not.toBeNull();
    expect(change).not.toBeNull();
    expect(rescan).not.toBeNull();
    if (path !== null && change !== null && rescan !== null) {
      expect(change.y).toBeGreaterThanOrEqual(path.y + path.height);
      expect(rescan.y).toBeGreaterThanOrEqual(path.y + path.height);
    }
  });
});

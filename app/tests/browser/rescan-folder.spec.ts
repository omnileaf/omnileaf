import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

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
  isAvailable: true,
};
const SAMPLE_COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};
const NO_CHANGES = {
  added: 0,
  updated: 0,
  moved: 0,
  removed: 0,
  unreadableBooks: 0,
  unreadableFolders: 0,
};

/** Counts the times the app asks for every folder to be rescanned. */
class StartRescans {
  count = 0;
}

const startRescans = new StartRescans();

const FOLDERS_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({ folders: [HOME, SAMPLE_COMICS], next: null }),
  rescanLibraryFolders: () => {
    startRescans.count += 1;
    return [];
  },
};

function rescanReport(page: Page): Locator {
  return page
    .getByRole("region", { name: "Folders" })
    .getByRole("status")
    .filter({ hasText: SAMPLE_COMICS.name });
}

async function rescanSampleComics(page: Page): Promise<void> {
  await page.goto("/settings/library");
  await page.getByRole("button", { name: "Rescan Sample Comics" }).click();
}

test.use({ backend: FOLDERS_BACKEND });

test.beforeEach(() => {
  startRescans.count = 0;
});

test("rescans every library folder once as the app starts", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => startRescans.count).toBe(1);
});

test("shows Rescan as an icon with its verb as the tooltip", async ({
  page,
}) => {
  await page.goto("/settings/library");

  for (const rescan of [
    page.getByRole("button", { name: "Rescan Omnileaf" }),
    page.getByRole("button", { name: "Rescan Sample Comics" }),
  ]) {
    await expect(rescan).toHaveText("");
    await expect(rescan).toHaveAttribute("title", "Rescan");
  }
});

test("rings Rescan when the keyboard reaches it", async ({ page }) => {
  await page.goto("/settings/library");
  const folders = page.getByRole("region", { name: "Folders" });
  const rescan = folders.getByRole("button", { name: "Rescan Sample Comics" });
  await expect(rescan).toBeVisible();
  await folders.getByRole("button", { name: "Add a folder" }).focus();

  await page.keyboard.press("Tab");

  await expect(rescan).toBeFocused();
  await expect(rescan).toHaveCSS("outline-style", "solid");
});

test.describe("with a folder whose files changed", () => {
  test.use({
    backend: {
      ...FOLDERS_BACKEND,
      rescanLibraryFolder: async (id, onProgress) => {
        await onProgress.send({ stage: "finding" });
        await onProgress.send({ stage: "reading", scanned: 2, total: 2 });
        return {
          id,
          name: SAMPLE_COMICS.name,
          outcome: { kind: "rescanned", ...NO_CHANGES, added: 1, moved: 1 },
        };
      },
    },
  });

  test("rescans a folder from Settings › Library and reports what changed", async ({
    page,
  }) => {
    await rescanSampleComics(page);

    await expect(rescanReport(page).getByRole("paragraph")).toHaveText([
      "Rescanned Sample Comics.",
      "1 book added.",
      "1 book moved or renamed.",
    ]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the rescan report has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await rescanSampleComics(page);
      await expect(rescanReport(page)).toContainText("1 book added.");

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("while a folder is being rescanned", () => {
  test.use({
    backend: {
      ...FOLDERS_BACKEND,
      rescanLibraryFolder: async (_, onProgress) => {
        await onProgress.send({ stage: "reading", scanned: 3, total: 7 });
        return new Promise(() => undefined);
      },
    },
  });

  test("shows how far the rescan has got", async ({ page }) => {
    await rescanSampleComics(page);

    const bar = page.getByRole("progressbar", {
      name: "Checking Sample Comics for changes",
    });
    await expect(bar).toHaveAttribute("value", "3");
    await expect(bar).toHaveAccessibleDescription("3 of 7 books");
    await expect(
      page.getByRole("button", { name: "Rescan Omnileaf" }),
    ).toBeDisabled();
  });

  test("spins the icon of the folder being rescanned, and only that one", async ({
    page,
  }) => {
    await rescanSampleComics(page);

    await expect(
      page.getByRole("button", { name: "Rescan Sample Comics" }).locator("svg"),
    ).toHaveCSS("animation-name", "spin");
    await expect(
      page.getByRole("button", { name: "Rescan Omnileaf" }).locator("svg"),
    ).toHaveCSS("animation-name", "none");
  });

  test("keeps the icon still and the progress showing when motion is reduced", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await rescanSampleComics(page);

    await expect(
      page.getByRole("progressbar", {
        name: "Checking Sample Comics for changes",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rescan Sample Comics" }).locator("svg"),
    ).toHaveCSS("animation-name", "none");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the rescan's progress has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await rescanSampleComics(page);
      await expect(page.getByRole("progressbar")).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("with a folder that isn't available", () => {
  test.use({
    backend: {
      ...FOLDERS_BACKEND,
      libraryFolders: () => ({
        folders: [HOME, { ...SAMPLE_COMICS, isAvailable: false }],
        next: null,
      }),
      rescanLibraryFolder: (id) => ({
        id,
        name: SAMPLE_COMICS.name,
        outcome: { kind: "unreachable" },
      }),
    },
  });

  test("marks the folder and keeps its books when a rescan can't reach it", async ({
    page,
  }) => {
    await rescanSampleComics(page);

    await expect(
      page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
    ).toHaveText(["Sample Comics Not available /media/Sample Comics"]);
    await expect(rescanReport(page)).toHaveText(
      "Sample Comics isn't available. Its books stay in your library until it's back.",
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a folder that isn't available has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await rescanSampleComics(page);
      await expect(rescanReport(page)).toContainText("isn't available");

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

import type { Locator, Page } from "@playwright/test";

import pseudo from "../../messages/en-XA.json" with { type: "json" };

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  sidewaysOverflow,
  test,
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
const NO_CHANGES = {
  added: 0,
  updated: 0,
  moved: 0,
  removed: 0,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

const rescanEveryFolderCalls = { count: 0 };

const FOLDERS_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({ folders: [HOME, SAMPLE_COMICS], next: null }),
  rescanLibraryFolders: () => {
    rescanEveryFolderCalls.count += 1;
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
  rescanEveryFolderCalls.count = 0;
});

test("rescans every library folder once as the app starts", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => rescanEveryFolderCalls.count).toBe(1);
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

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
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

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
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

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("with a folder found empty", () => {
  const calls = { removed: [] as string[], putBack: [] as string[] };

  test.use({
    backend: {
      ...FOLDERS_BACKEND,
      rescanLibraryFolder: (id) => ({
        id,
        name: SAMPLE_COMICS.name,
        outcome: { kind: "foundEmpty" },
      }),
      removeBooksOfEmptiedFolder: (id) => {
        calls.removed.push(id);
        return { kind: "removed", books: 3 };
      },
      putBackRemovedBooks: (id) => {
        calls.putBack.push(id);
        return true;
      },
    },
  });

  test.beforeEach(() => {
    calls.removed = [];
    calls.putBack = [];
  });

  function removeItsBooks(page: Page): Locator {
    return page
      .getByRole("region", { name: "Folders" })
      .getByRole("button", { name: "Remove its books" });
  }

  test("offers to remove the folder's books, then puts them back on Undo", async ({
    page,
  }) => {
    await rescanSampleComics(page);
    await expect(rescanReport(page)).toHaveText(
      "Found no books in Sample Comics. Its books stay in your library in case its drive isn't connected.",
    );

    await removeItsBooks(page).click();
    await expect(page.getByText("3 books removed")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    expect(calls.removed).toEqual([SAMPLE_COMICS.id]);
    await expect.poll(() => calls.putBack).toEqual([SAMPLE_COMICS.id]);
    await expect(page.getByText("3 books removed")).toBeHidden();
    await expect(removeItsBooks(page)).toBeHidden();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the offer to remove the books has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await rescanSampleComics(page);
      await expect(removeItsBooks(page)).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });

    test(`the offer to undo the removal has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await rescanSampleComics(page);
      await removeItsBooks(page).click();
      await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }

  test("offers to remove the books in the pseudo-locale without overflowing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await page.goto("/settings/library");
    await page
      .getByRole("button", {
        name: pseudo.library_rescan_folder_label.replace(
          "{name}",
          SAMPLE_COMICS.name,
        ),
      })
      .click();

    await expect(
      page.getByRole("button", { name: pseudo.library_remove_books }),
    ).toBeVisible();
    const overflowing = await sidewaysOverflow(page);

    expect(overflowing).toEqual([]);
  });
});

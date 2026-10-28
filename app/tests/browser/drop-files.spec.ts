import { TauriEvent } from "@tauri-apps/api/event";
import type { Locator, Page } from "@playwright/test";

import type {
  DropMode,
  DropOutcome,
  DropSummary,
} from "../../src/lib/ipc/bindings.ts";
import { emitFakeEvent, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
} from "./fixtures.ts";
import { BOOK_ID, NOT_STARTED, readerBook, servePages } from "./reader-book.ts";

const DRAG_ENTER = TauriEvent.DRAG_ENTER;
const DRAG_DROP = TauriEvent.DRAG_DROP;
const DRAG_LEAVE = TauriEvent.DRAG_LEAVE;
const PATHS = [
  "/home/reader/Downloads/One.cbz",
  "/home/reader/Downloads/Two.cbz",
];

const USABLE: DropSummary = {
  first: "One.cbz",
  more: 1,
  totalKilobytes: 45_000,
  refused: [],
};
const ALL_REFUSED: DropSummary = {
  first: null,
  more: 0,
  totalKilobytes: 0,
  refused: [
    { name: "notes.pdf", reason: "notAComic" },
    { name: "Volume 6.cbr", reason: "typeNotReadYet" },
  ],
};
const ADDED: DropOutcome = {
  kind: "added",
  folders: [
    {
      name: "Downloads",
      series: 1,
      books: 12,
      unreadableBooks: 0,
      unsupportedBooks: 0,
      unreadableFolders: 0,
    },
  ],
};

const dropped: { paths: string[]; mode: DropMode }[] = [];

function backendFor(summary: DropSummary): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("linux"),
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    inspectDrop: () => summary,
    dropFiles: (paths, mode) => {
      dropped.push({ paths, mode });
      return mode === "readNow"
        ? { kind: "reading", book: BOOK_ID, isInLibrary: false }
        : ADDED;
    },
  };
}

async function dragOver(
  page: Page,
  paths: string[],
  shown: Locator,
): Promise<void> {
  await expect(async () => {
    await emitFakeEvent(page, DRAG_ENTER, { paths, position: { x: 1, y: 1 } });
    await expect(shown).toBeVisible({ timeout: 500 });
  }).toPass();
}

async function dropOn(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("the drop target has no box");
  }
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  await emitFakeEvent(page, DRAG_DROP, {
    paths: PATHS,
    position: {
      x: (box.x + box.width / 2) * ratio,
      y: (box.y + box.height / 2) * ratio,
    },
  });
}

test.beforeEach(async ({ page }) => {
  dropped.length = 0;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("with comic files dragged over the window", () => {
  test.use({ backend: backendFor(USABLE) });

  test("names the first file, how many more there are and their size", async ({
    page,
  }) => {
    await dragOver(page, PATHS, page.getByText("Read now"));

    await expect(page.getByText("One.cbz and 1 more · 45 MB")).toBeVisible();
    await expect(page.getByText("Read now")).toBeVisible();
    await expect(page.getByText("Add to your library")).toBeVisible();
  });

  test("goes away when the drag leaves", async ({ page }) => {
    await dragOver(page, PATHS, page.getByText("Read now"));
    await expect(page.getByText("Read now")).toBeVisible();

    await emitFakeEvent(page, DRAG_LEAVE);

    await expect(page.getByText("Read now")).toBeHidden();
  });

  test("opens the first file when dropped on Read now", async ({ page }) => {
    await servePages(page);
    await dragOver(page, PATHS, page.getByText("Read now"));
    const readNow = page.locator('[data-drop-target="readNow"]');
    await expect(readNow).toBeVisible();

    await dropOn(page, readNow);

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
    expect(dropped).toEqual([{ paths: PATHS, mode: "readNow" }]);
  });

  test("links the files' folder when dropped on Add to your library", async ({
    page,
  }) => {
    await dragOver(page, PATHS, page.getByText("Read now"));
    const add = page.locator('[data-drop-target="add"]');
    await expect(add).toBeVisible();

    await dropOn(page, add);

    await expect(page.getByText("Added 12 books from Downloads")).toBeVisible();
    expect(dropped).toEqual([{ paths: PATHS, mode: "add" }]);
  });

  test("copies the files instead while Alt is held", async ({ page }) => {
    await dragOver(page, PATHS, page.getByText("Read now"));
    const add = page.locator('[data-drop-target="add"]');
    await expect(add).toBeVisible();

    await page.keyboard.down("Alt");
    await expect(
      add.getByText("Copies them into your home folder instead."),
    ).toBeVisible();
    await dropOn(page, add);
    await page.keyboard.up("Alt");

    expect(dropped).toEqual([{ paths: PATHS, mode: "copy" }]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await dragOver(page, PATHS, page.getByText("Read now"));
      await expect(page.getByText("Read now")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("with files the library cannot use dragged over the window", () => {
  test.use({ backend: backendFor(ALL_REFUSED) });

  test("explains why nothing would be added", async ({ page }) => {
    await dragOver(page, PATHS, page.getByText("Nothing added"));

    await expect(page.getByText("Nothing added")).toBeVisible();
    await expect(
      page.getByText("notes.pdf isn't a comic or book Omnileaf reads."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Volume 6.cbr is a comic type this version can't read yet.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Read now")).toBeHidden();
  });

  test("adds nothing when they are dropped", async ({ page }) => {
    await dragOver(page, PATHS, page.getByText("Nothing added"));
    await expect(page.getByText("Nothing added")).toBeVisible();

    await emitFakeEvent(page, DRAG_DROP, {
      paths: PATHS,
      position: { x: 200, y: 200 },
    });

    await expect(page.getByText("Nothing added")).toBeHidden();
    expect(dropped).toEqual([]);
  });
});

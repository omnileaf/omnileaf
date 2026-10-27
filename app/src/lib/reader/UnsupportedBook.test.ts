import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type {
  BookFile,
  BookPlace,
  commands,
  FileType,
  IpcError,
} from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.ts";
import Toasts from "#lib/notices/Toasts.svelte";
import { seriesIdIn } from "#lib/series/series-id.ts";

import { clearToasts } from "../../../tests/components/clear-toasts";
import "../../app.css";

import { type BookId, bookIdIn } from "./opened-book.ts";
import UnsupportedBook from "./UnsupportedBook.svelte";

type Hidden = Awaited<ReturnType<typeof commands.hideFilesLike>>;

const BOOK = bookIdIn("0190a3e4-0000-8000-8000-0000000000b6");
const SERIES = seriesIdIn("0190a3e4-0000-8000-8000-0000000000a4");
const CBR_FILE: BookFile = { name: "Volume 6.cbr", fileType: "cbr" };

function place(): BookPlace {
  if (BOOK === undefined || SERIES === undefined) {
    throw new Error("the sample ids have no id's shape");
  }
  return {
    id: BOOK,
    title: "Volume 6",
    series: SERIES,
    seriesTitle: "Sample Series 04",
  };
}

const BOOK_GONE: IpcError = {
  code: "bookNotFound",
  message: "that book isn't in the library",
};

class FileTypes {
  readonly hiddenLike: BookId[] = [];
  readonly shownAgain: FileType[] = [];
  answer: Promise<Hidden> = Promise.resolve({ status: "ok", data: "cbr" });

  readonly hideFilesLike = (book: BookId): Promise<Hidden> => {
    this.hiddenLike.push(book);
    return this.answer;
  };

  readonly showFileType = (fileType: FileType) => {
    this.shownAgain.push(fileType);
    return Promise.resolve({ status: "ok" as const, data: null });
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await clearToasts();
});

async function shown(
  file: BookFile | null,
  {
    shownPlace = place(),
    fileTypes = new FileTypes(),
  }: { shownPlace?: BookPlace | null; fileTypes?: FileTypes } = {},
) {
  const notices = new Notices();
  const screen = await render(UnsupportedBook, {
    place: shownPlace,
    file,
    platform: "linux",
    hideFilesLike: fileTypes.hideFilesLike,
    showFileType: fileTypes.showFileType,
    notices,
  });
  await render(Toasts, { notices, platform: "linux", theme: "light" });
  return {
    screen,
    fileTypes,
    hide: screen.getByRole("button", { name: "Hide files like this" }),
  };
}

function toastSaying(text: string) {
  return page.getByRole("listitem").filter({ hasText: text });
}

test("names the file and the type this version can't open", async () => {
  const { screen } = await shown(CBR_FILE);

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "Omnileaf can't open this file",
      }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Volume 6.cbr is a CBR file, which this version can't open yet. The file stays where it is.",
      ),
    )
    .toBeVisible();
});

test("says the file stays where it is even when it can't name the file", async () => {
  const { screen } = await shown(null);

  await expect
    .element(
      screen.getByText(
        "This version can't open files like this one yet. The file stays where it is.",
      ),
    )
    .toBeVisible();
});

test("lists the files Omnileaf opens and those it doesn't yet", async () => {
  const { screen } = await shown(CBR_FILE);

  const kinds = screen
    .getByRole("list")
    .filter({ hasText: "Folders of images" })
    .getByRole("listitem");

  await expect
    .element(
      screen.getByRole("heading", { level: 2, name: "Files Omnileaf opens" }),
    )
    .toBeVisible();
  expect(kinds.elements().map((kind) => kind.textContent.trim())).toEqual([
    "CBZ",
    "CB7",
    "Folders of images",
  ]);
  await expect
    .element(screen.getByText("Not yet: CBR and RAR files."))
    .toBeVisible();
});

test("says showing the file is still to come", async () => {
  const { screen } = await shown(CBR_FILE);

  await expect
    .element(
      screen.getByRole("button", { name: "Show in folder · coming soon" }),
    )
    .toBeDisabled();
});

test("hides files like this one and offers to undo it", async () => {
  const { fileTypes, hide } = await shown(CBR_FILE);

  await hide.click();

  expect(fileTypes.hiddenLike).toEqual([place().id]);
  await expect
    .element(
      toastSaying(
        "CBR files hidden They leave your library at the next rescan.",
      ),
    )
    .toBeVisible();
  await expect.element(hide).toHaveAttribute("aria-disabled", "true");
});

test("shows the type again on Undo and lets it be hidden again", async () => {
  const { fileTypes, hide } = await shown(CBR_FILE);
  await hide.click();

  await page.getByRole("button", { name: "Undo" }).click();

  expect(fileTypes.shownAgain).toEqual(["cbr"]);
  await expect.element(hide).not.toHaveAttribute("aria-disabled", "true");
});

test("asks to hide only once while the first ask is on its way", async () => {
  const fileTypes = new FileTypes();
  fileTypes.answer = new Promise(() => undefined);
  const { hide } = await shown(CBR_FILE, { fileTypes });

  await hide.click();
  await hide.click({ force: true });

  expect(fileTypes.hiddenLike).toHaveLength(1);
});

test("keeps Hide on offer when hiding fails", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const fileTypes = new FileTypes();
  fileTypes.answer = Promise.resolve({ status: "error", error: BOOK_GONE });
  const { hide } = await shown(CBR_FILE, { fileTypes });

  await hide.click();

  await expect.poll(() => reported.mock.calls).toEqual([[BOOK_GONE]]);
  await expect.element(hide).not.toHaveAttribute("aria-disabled", "true");
});

test("says hiding keeps files of the type out of the library from now on", async () => {
  const { screen } = await shown(CBR_FILE);

  await expect
    .element(
      screen.getByText(
        "Hiding keeps CBR files out of your library from now on.",
      ),
    )
    .toBeVisible();
});

test("offers no Hide for a book it can't place in the library", async () => {
  const { hide } = await shown(CBR_FILE, { shownPlace: null });

  await expect.element(hide).not.toBeInTheDocument();
});

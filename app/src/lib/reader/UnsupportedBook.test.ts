import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { BookFile, BookPlace } from "#lib/ipc/bindings.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

import "../../app.css";

import { bookIdIn } from "./opened-book.ts";
import UnsupportedBook from "./UnsupportedBook.svelte";

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

function shown(file: BookFile | null) {
  return render(UnsupportedBook, { place: place(), file, platform: "linux" });
}

test("names the file and the type this version can't open", async () => {
  const screen = await shown(CBR_FILE);

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
  const screen = await shown(null);

  await expect
    .element(
      screen.getByText(
        "This version can't open files like this one yet. The file stays where it is.",
      ),
    )
    .toBeVisible();
});

test("lists the files Omnileaf opens and those it doesn't yet", async () => {
  const screen = await shown(CBR_FILE);

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
  const screen = await shown(CBR_FILE);

  await expect
    .element(
      screen.getByRole("button", { name: "Show in folder · coming soon" }),
    )
    .toBeDisabled();
});

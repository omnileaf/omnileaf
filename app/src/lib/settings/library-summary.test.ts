import { expect, test } from "vitest";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import { librarySummaryOf } from "./library-summary";

function folder(id: string, kind: LibraryFolder["kind"]): LibraryFolder {
  return {
    id: id as LibraryFolder["id"],
    kind,
    name: id,
    location: `/storage/${id}`,
    isAvailable: true,
  };
}

const HOME = folder("home", "home");

test("says nothing when only an empty home folder is there", () => {
  expect(
    librarySummaryOf({ kind: "loaded", home: HOME, linked: [] }, 0),
  ).toBeUndefined();
});

test("counts the series alone when they all sit in the home folder", () => {
  expect(
    librarySummaryOf({ kind: "loaded", home: HOME, linked: [] }, 128),
  ).toBe("128 series");
});

test("counts the linked folders beside the series, leaving out the home folder", () => {
  const linked = [folder("comics", "linked"), folder("manga", "linked")];

  expect(librarySummaryOf({ kind: "loaded", home: HOME, linked }, 128)).toBe(
    "2 folders · 128 series",
  );
});

test("counts the linked folders even before any series is found", () => {
  const linked = [folder("comics", "linked")];

  expect(librarySummaryOf({ kind: "loaded", home: HOME, linked }, 0)).toBe(
    "1 folder · 0 series",
  );
});

test("says nothing when the folders can't be read", () => {
  expect(librarySummaryOf({ kind: "failed" }, 3)).toBeUndefined();
});

import { expect, test } from "vitest";

import type { DropSummary } from "#lib/ipc/bindings.ts";

import { dropWhat, refusalLines } from "./drop-text.ts";

function summary(overrides: Partial<DropSummary>): DropSummary {
  return {
    first: "One.cbz",
    more: 0,
    totalKilobytes: 0,
    refused: [],
    ...overrides,
  };
}

test("names the first file, how many more there are and their size", () => {
  const text = dropWhat(
    summary({ first: "One.cbz", more: 2, totalKilobytes: 45_000 }),
  );

  expect(text).toBe("One.cbz and 2 more · 45 MB");
});

test("names a single file with its size", () => {
  const text = dropWhat(summary({ more: 0, totalKilobytes: 2000 }));

  expect(text).toBe("One.cbz · 2 MB");
});

test("leaves the size out when the drop holds only folders", () => {
  const text = dropWhat(summary({ first: "Series", more: 1 }));

  expect(text).toBe("Series and 1 more");
});

test("groups the refused names by reason in one sentence each", () => {
  const lines = refusalLines([
    { name: "notes.pdf", reason: "notAComic" },
    { name: "readme.txt", reason: "notAComic" },
    { name: "Volume 6.cbr", reason: "typeNotReadYet" },
  ]);

  expect(lines).toEqual([
    "notes.pdf and readme.txt aren't comics or books Omnileaf reads.",
    "Volume 6.cbr is a comic type this version can't read yet.",
  ]);
});

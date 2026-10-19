import { expect, test } from "vitest";

import type { SeriesDetails } from "#lib/ipc/bindings.ts";

import { editsBefore } from "./details-to-edit.ts";

test("keeps the edits a series had before the editor opened, to put back with Undo", () => {
  const details: SeriesDetails = {
    title: { fromFile: "Sample Series 04", edited: "The Harbour Gate" },
    people: { fromFile: [], edited: null },
    tags: { fromFile: ["Sea"], edited: ["Seinen"] },
    summary: { fromFile: null, edited: null },
    isMarkedAdult: true,
    isRatedAdult: false,
  };

  expect(editsBefore(details)).toEqual({
    title: "The Harbour Gate",
    people: null,
    tags: ["Seinen"],
    summary: null,
    isMarkedAdult: true,
  });
});

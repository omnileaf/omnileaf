import { describe, expect, it } from "vitest";

import type { SeriesDetails } from "#lib/ipc/bindings.ts";

import {
  changesBetween,
  draftOf,
  editsOf,
  isEdited,
  withFileValue,
} from "./detail-edits.ts";

const FROM_FILES: SeriesDetails = {
  title: { fromFile: "Sample Series 04 (2019 edition)", edited: null },
  people: {
    fromFile: [
      { name: "Author A", role: "story" },
      { name: "Author C", role: "art" },
    ],
    edited: null,
  },
  tags: { fromFile: ["Seinen", "Sea"], edited: null },
  summary: { fromFile: null, edited: null },
  isMarkedAdult: false,
  isRatedAdult: false,
};

const EDITED: SeriesDetails = {
  ...FROM_FILES,
  title: { ...FROM_FILES.title, edited: "The Harbour Gate" },
  tags: { ...FROM_FILES.tags, edited: ["Seinen", "Sea", "Slice of life"] },
};

describe("a draft of a series' details", () => {
  it("starts from each edit, or the file's value where there is none", () => {
    expect(draftOf(EDITED)).toEqual({
      title: "The Harbour Gate",
      people: FROM_FILES.people.fromFile,
      tags: ["Seinen", "Sea", "Slice of life"],
      summary: "",
      isMarkedAdult: false,
    });
  });

  it("says which values differ from the file's", () => {
    const draft = draftOf(EDITED);

    expect(
      (["title", "people", "tags", "summary"] as const).filter((field) =>
        isEdited(field, EDITED, draft),
      ),
    ).toEqual(["title", "tags"]);
  });

  it("lets an emptied field fall back to the file's value", () => {
    const draft = { ...draftOf(EDITED), title: " ", summary: "" };

    expect([
      isEdited("title", EDITED, draft),
      isEdited("summary", EDITED, draft),
    ]).toEqual([false, false]);
  });

  it("puts one value back to the file's and leaves the rest", () => {
    const draft = withFileValue("title", EDITED, draftOf(EDITED));

    expect([draft.title, draft.tags.length]).toEqual([
      "Sample Series 04 (2019 edition)",
      3,
    ]);
  });

  it("names what changed since the editor opened, in the order the fields show", () => {
    const before = draftOf(FROM_FILES);
    const after = {
      ...before,
      tags: ["Seinen"],
      title: "The Harbour Gate",
      isMarkedAdult: true,
    };

    expect(changesBetween(before, after)).toEqual([
      "title",
      "tags",
      "adultMark",
    ]);
  });
});

describe("the edits a draft keeps", () => {
  it("keeps only values that differ from the file's", () => {
    expect(editsOf(EDITED, draftOf(EDITED))).toEqual({
      title: "The Harbour Gate",
      people: null,
      tags: ["Seinen", "Sea", "Slice of life"],
      summary: null,
      isMarkedAdult: false,
    });
  });

  it("trims what was typed and lets an emptied field fall back to the file's", () => {
    const draft = {
      ...draftOf(FROM_FILES),
      title: "  ",
      summary: " Letters across the sea. ",
    };

    expect(editsOf(FROM_FILES, draft)).toMatchObject({
      title: null,
      summary: "Letters across the sea.",
    });
  });
});

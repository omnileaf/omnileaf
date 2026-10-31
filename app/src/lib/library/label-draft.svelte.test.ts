import { expect, test } from "vitest";

import type { SeriesLabels } from "#lib/ipc/bindings.ts";

import { LabelDraft } from "./label-draft.svelte";

const THREE = 3;

function category(id: string, name: string, holding: number) {
  return {
    category: { id, name },
    holding,
  } as SeriesLabels["categories"][number];
}

function labelsOf(overrides: Partial<SeriesLabels> = {}): SeriesLabels {
  return {
    keepsLabels: true,
    categories: [
      category("c1", "Reading", 3),
      category("c2", "Manga", 2),
      category("c3", "Comics", 0),
    ],
    tags: [
      { tag: "Sea", holding: 3 },
      { tag: "Seinen", holding: 2 },
    ],
    suggestedTags: ["Slice of life", "Letters", "Sea"],
    ...overrides,
  };
}

function loaded(labels: SeriesLabels = labelsOf()): LabelDraft {
  const draft = new LabelDraft(() => THREE);
  draft.load(labels);
  return draft;
}

test("starts each category as held by all, some or none of the series", () => {
  const draft = loaded();

  expect(draft.labels?.categories.map((held) => draft.choiceOf(held))).toEqual([
    "all",
    "some",
    "none",
  ]);
});

test("changes nothing until a choice differs from what the series hold", () => {
  const draft = loaded();

  expect(draft.changes()).toEqual({
    categoriesAdded: [],
    categoriesRemoved: [],
    categoriesCreated: [],
    tagsAdded: [],
    tagsRemoved: [],
  });
});

test("adds a category chosen for all and removes one cleared for all", () => {
  const draft = loaded();

  draft.choices.c2 = "all";
  draft.choices.c1 = "none";
  draft.choices.c3 = "all";

  expect(draft.changes()).toMatchObject({
    categoriesAdded: ["c2", "c3"],
    categoriesRemoved: ["c1"],
  });
});

test("creates a category once however often its name is added", () => {
  const draft = loaded();

  draft.addCategory("  Plan to read ");
  draft.addCategory("Plan to read");
  draft.addCategory("   ");

  expect(draft.created).toEqual(["Plan to read"]);
  expect(draft.changes().categoriesCreated).toEqual(["Plan to read"]);
});

test("shows a tag added to every series and lists it as held by all", () => {
  const draft = loaded();

  draft.addTag(" Letters ");

  expect(draft.tagsShown.at(-1)).toEqual({ tag: "Letters", holding: THREE });
  expect(draft.changes().tagsAdded).toEqual(["Letters"]);
});

test("drops a tag already shown instead of adding it twice", () => {
  const draft = loaded();

  draft.addTag("Sea");
  draft.addTag("");

  expect(draft.changes().tagsAdded).toEqual([]);
});

test("removes a held tag, and bringing it back undoes the removal", () => {
  const draft = loaded();

  draft.removeTag("Seinen");
  expect(draft.tagsShown.map(({ tag }) => tag)).toEqual(["Sea"]);
  expect(draft.changes().tagsRemoved).toEqual(["Seinen"]);

  draft.addTag("Seinen");
  expect(draft.changes().tagsRemoved).toEqual([]);
});

test("forgets a tag added in this sheet instead of removing it from the series", () => {
  const draft = loaded();

  draft.addTag("Letters");
  draft.removeTag("Letters");

  expect(draft.changes()).toMatchObject({ tagsAdded: [], tagsRemoved: [] });
});

test("suggests only the tags not already shown", () => {
  const draft = loaded();

  expect(draft.suggested).toEqual(["Slice of life", "Letters"]);

  draft.addTag("Letters");

  expect(draft.suggested).toEqual(["Slice of life"]);
});

test("starts over when loaded again", () => {
  const draft = loaded();
  draft.addCategory("Plan to read");
  draft.addTag("Letters");
  draft.choices.c3 = "all";

  draft.load(labelsOf());

  expect(draft.created).toEqual([]);
  expect(draft.changes()).toMatchObject({
    categoriesAdded: [],
    tagsAdded: [],
  });
});

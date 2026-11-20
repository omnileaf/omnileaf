import { expect, test } from "vitest";

import type { LibraryCategory, SeriesLabels } from "#lib/ipc/bindings.ts";

import { fieldToFocus } from "./label-focus.ts";

const NOTHING_KEPT: SeriesLabels = {
  keepsLabels: true,
  categories: [],
  tags: [],
  suggestedTags: [],
};

const READING = {
  category: { id: "c1" as LibraryCategory["id"], name: "Reading" },
  holding: 1,
};

test("leaves the new category field alone while there are categories to tick", () => {
  const labels = { ...NOTHING_KEPT, categories: [READING] };

  expect(fieldToFocus(labels, "categories")).toBeUndefined();
});

test("focuses the new category field when there is no category yet", () => {
  expect(fieldToFocus(NOTHING_KEPT, "categories")).toBe("category");
});

test("leaves the tag field alone while the series hold tags", () => {
  const labels = { ...NOTHING_KEPT, tags: [{ tag: "Sea", holding: 1 }] };

  expect(fieldToFocus(labels, "tags")).toBeUndefined();
});

test("leaves the tag field alone while there are suggested tags", () => {
  const labels = { ...NOTHING_KEPT, suggestedTags: ["Letters"] };

  expect(fieldToFocus(labels, "tags")).toBeUndefined();
});

test("focuses the tag field when there is no tag to pick", () => {
  const labels = { ...NOTHING_KEPT, categories: [READING] };

  expect(fieldToFocus(labels, "tags")).toBe("tag");
});

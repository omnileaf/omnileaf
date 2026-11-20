import { expect, test } from "vitest";

import type { LibraryCategory, SeriesLabels } from "#lib/ipc/bindings.ts";

import { hasNothingToPick } from "./label-focus.ts";

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

const SEA = { tag: "Sea", holding: 1 };

test("has categories to tick once one exists", () => {
  const labels = { ...NOTHING_KEPT, categories: [READING] };

  expect(hasNothingToPick(labels, "categories")).toBe(false);
});

test("has nothing to pick from Categories when there is no category yet", () => {
  expect(hasNothingToPick(NOTHING_KEPT, "categories")).toBe(true);
});

test("has nothing to pick from Categories even when the series hold tags", () => {
  const labels = { ...NOTHING_KEPT, tags: [SEA], suggestedTags: ["Letters"] };

  expect(hasNothingToPick(labels, "categories")).toBe(true);
});

test("has tags to pick while the series hold tags", () => {
  const labels = { ...NOTHING_KEPT, tags: [SEA] };

  expect(hasNothingToPick(labels, "tags")).toBe(false);
});

test("has tags to pick while there are suggested tags", () => {
  const labels = { ...NOTHING_KEPT, suggestedTags: ["Letters"] };

  expect(hasNothingToPick(labels, "tags")).toBe(false);
});

test("has nothing to pick from Tags when there is no tag, even with categories", () => {
  const labels = { ...NOTHING_KEPT, categories: [READING] };

  expect(hasNothingToPick(labels, "tags")).toBe(true);
});

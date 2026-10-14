import { describe, expect, it } from "vitest";

import type { SeriesCreator } from "#lib/ipc/bindings.ts";

import { creditsOf, creatorsByRole } from "./credits.ts";

const A: SeriesCreator = { name: "Author A", role: "story" };
const B: SeriesCreator = { name: "Author B", role: "story" };
const C: SeriesCreator = { name: "Author C", role: "art" };
const D: SeriesCreator = { name: "Author D", role: "art" };

describe("creditsOf", () => {
  it("credits no one when the books name no creator", () => {
    expect(creditsOf([])).toBeUndefined();
  });

  it("credits one creator of story and art by name", () => {
    expect(creditsOf([{ name: "Author A", role: "storyAndArt" }])).toEqual({
      kind: "by",
      names: ["Author A"],
      more: 0,
    });
  });

  it("credits the first creator of each role and counts the rest", () => {
    expect(creditsOf([A, B, C, D])).toEqual({
      kind: "roles",
      credits: [
        { role: "story", name: "Author A" },
        { role: "art", name: "Author C" },
      ],
      more: 2,
    });
  });

  it("credits the first two by name when the books give no roles", () => {
    const unroled = [A, B, C, D].map(({ name }) => ({ name, role: null }));

    expect(creditsOf(unroled)).toEqual({
      kind: "by",
      names: ["Author A", "Author B"],
      more: 2,
    });
  });
});

describe("creatorsByRole", () => {
  it("lists everyone under their role, story before art", () => {
    expect(creatorsByRole([C, A, D, B])).toEqual([
      { role: "story", names: ["Author A", "Author B"] },
      { role: "art", names: ["Author C", "Author D"] },
    ]);
  });

  it("lists creators without a role together", () => {
    expect(creatorsByRole([{ name: "Author A", role: null }])).toEqual([
      { role: null, names: ["Author A"] },
    ]);
  });
});

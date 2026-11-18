import { expect, test } from "vitest";

import type { ChangeEntry, ChangeKind } from "#lib/ipc/bindings.ts";

import { changeGroups, firstChangeGroups } from "./change-groups.ts";

function entry(kind: ChangeKind, summary: string): ChangeEntry {
  return { kind, summary };
}

test("groups a version's notes by kind in the changelog's order, each kind keeping its notes in order", () => {
  const notes = {
    version: "0.2.0",
    entries: [
      entry("fix", "Back closes an open sheet"),
      entry("feat", "Series pages show tabs"),
      entry("perf", "Covers load sooner"),
      entry("feat", "Search remembers its filters"),
      entry("sec", "Shares refuse plain HTTP"),
      entry("breaking", "Old backups no longer open"),
    ],
  };

  const groups = changeGroups(notes);

  expect(groups).toEqual([
    { kind: "breaking", summaries: ["Old backups no longer open"] },
    { kind: "sec", summaries: ["Shares refuse plain HTTP"] },
    {
      kind: "feat",
      summaries: ["Series pages show tabs", "Search remembers its filters"],
    },
    { kind: "perf", summaries: ["Covers load sooner"] },
    { kind: "fix", summaries: ["Back closes an open sheet"] },
  ]);
});

test("leaves out the kinds a version has no notes of", () => {
  const notes = {
    version: "0.1.1",
    entries: [entry("fix", "Back closes an open sheet")],
  };

  const groups = changeGroups(notes);

  expect(groups).toEqual([
    { kind: "fix", summaries: ["Back closes an open sheet"] },
  ]);
});

test("keeps only the first few notes in the changelog's order, dropping a kind left with none", () => {
  const notes = {
    version: "0.2.0",
    entries: [
      entry("fix", "Fix one"),
      entry("feat", "New one"),
      entry("feat", "New two"),
      entry("perf", "Faster one"),
      entry("fix", "Fix two"),
    ],
  };

  const groups = firstChangeGroups(notes, 3);

  expect(groups).toEqual([
    { kind: "feat", summaries: ["New one", "New two"] },
    { kind: "perf", summaries: ["Faster one"] },
  ]);
});

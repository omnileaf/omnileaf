import { expect, test } from "vitest";

import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";

import { earlierVersions } from "./earlier-version-line.ts";

function notesOf(version: string, kinds: readonly ChangeKind[]): VersionNotes {
  return {
    version,
    entries: kinds.map((kind, index) => ({
      kind,
      summary: `Change ${String(index)}`,
    })),
  };
}

function linesOf(earlier: readonly VersionNotes[]): string[] {
  return earlierVersions(earlier).map(({ line }) => line);
}

test("calls the oldest bundled version the first release, whatever its notes", () => {
  const lines = linesOf([
    notesOf("0.2.0", ["feat"]),
    notesOf("0.1.0", ["feat", "fix"]),
  ]);

  expect(lines.at(-1)).toBe("First release");
});

test("says a version whose notes are all fixes holds fixes only", () => {
  const lines = linesOf([
    notesOf("0.1.1", ["fix", "fix"]),
    notesOf("0.1.0", ["feat"]),
  ]);

  expect(lines[0]).toBe("Fixes only");
});

test("counts each kind of note a version has in the changelog's order", () => {
  const lines = linesOf([
    notesOf("0.3.0", ["fix", "feat", "feat", "fix", "feat"]),
    notesOf("0.2.0", ["perf", "fix", "sec", "breaking"]),
    notesOf("0.1.0", ["feat"]),
  ]);

  expect(lines.slice(0, 2)).toEqual([
    "3 new · 2 fixed",
    "1 breaking · 1 security · 1 faster · 1 fixed",
  ]);
});

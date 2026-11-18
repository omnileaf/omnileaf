import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";

export interface ChangeGroup {
  readonly kind: ChangeKind;
  readonly summaries: readonly string[];
}

const CHANGELOG_ORDER = {
  breaking: 0,
  sec: 1,
  feat: 2,
  perf: 3,
  fix: 4,
} as const satisfies Record<ChangeKind, number>;

export function changeGroups(notes: VersionNotes): readonly ChangeGroup[] {
  const grouped = Map.groupBy(notes.entries, (entry) => entry.kind);
  return [...grouped]
    .toSorted(
      ([earlier], [later]) => CHANGELOG_ORDER[earlier] - CHANGELOG_ORDER[later],
    )
    .map(([kind, entries]) => ({
      kind,
      summaries: entries.map((entry) => entry.summary),
    }));
}

export function firstChangeGroups(
  notes: VersionNotes,
  most: number,
): readonly ChangeGroup[] {
  let left = most;
  return changeGroups(notes).flatMap(({ kind, summaries }) => {
    const kept = summaries.slice(0, left);
    left -= kept.length;
    return kept.length === 0 ? [] : [{ kind, summaries: kept }];
  });
}

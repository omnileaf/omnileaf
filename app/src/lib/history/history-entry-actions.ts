import type { HistoryEntry } from "#lib/ipc/bindings.ts";

export interface HistoryEntryActions {
  readonly continueReading: (entry: HistoryEntry) => void;
  readonly openSeries: (entry: HistoryEntry) => void;
  readonly remove: (entry: HistoryEntry) => void;
}

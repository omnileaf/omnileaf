import { copy } from "#lib/copy.ts";
import type { CopyOutcome } from "#lib/copy-text.ts";

const CONFIRMATIONS = {
  copied: copy.issue.copied,
  selected: copy.issue.selected,
} satisfies Record<CopyOutcome, string>;

export function confirmationFor(outcome: CopyOutcome | undefined): string {
  return outcome === undefined ? "" : CONFIRMATIONS[outcome];
}

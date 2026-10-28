import type {
  DropSummary,
  RefusalReason,
  RefusedDrop,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { formatBytes } from "#lib/storage/bytes.ts";

const BYTES_PER_KILOBYTE = 1000;

const REFUSAL_SENTENCE = {
  notAComic: m.drop_not_comic,
  typeNotReadYet: m.drop_type_not_read,
} satisfies Record<
  RefusalReason,
  (inputs: { names: string; count: number }) => string
>;

const REFUSAL_REASONS = Object.keys(
  REFUSAL_SENTENCE,
) as readonly RefusalReason[];

function listed(names: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), {
    style: "long",
    type: "conjunction",
  }).format(names);
}

export function dropWhat(
  summary: DropSummary,
  shownName: (name: string) => string,
): string {
  const name = shownName(summary.first ?? "");
  const what =
    summary.more === 0
      ? name
      : m.drop_first_and_more({ name, count: summary.more });
  return summary.totalKilobytes === 0
    ? what
    : m.drop_with_size({
        what,
        size: formatBytes(summary.totalKilobytes * BYTES_PER_KILOBYTE),
      });
}

export function refusalLines(
  refused: readonly RefusedDrop[],
  shownName: (name: string) => string,
): string[] {
  return REFUSAL_REASONS.flatMap((reason) => {
    const names = refused
      .filter((drop) => drop.reason === reason)
      .map((drop) => shownName(drop.name));
    return names.length === 0
      ? []
      : [
          REFUSAL_SENTENCE[reason]({
            names: listed(names),
            count: names.length,
          }),
        ];
  });
}

import { m } from "$lib/paraglide/messages.js";
import { getLocale } from "$lib/paraglide/runtime.js";

export type StandInKind = "series" | "folder";

const STAND_IN_NAMES = {
  series: m.stand_in_series,
  folder: m.stand_in_folder,
} satisfies Record<StandInKind, (inputs: { number: string }) => string>;

const MINIMUM_DIGITS = 2;

export function standInNumber(number: number): string {
  return new Intl.NumberFormat(getLocale(), {
    minimumIntegerDigits: MINIMUM_DIGITS,
    useGrouping: false,
  }).format(number);
}

/** `number` belongs to the thing itself, not its place in a list, so gaps reveal nothing about what's hidden. */
export function standInName(kind: StandInKind, number: number): string {
  return STAND_IN_NAMES[kind]({ number: standInNumber(number) });
}

import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

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

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const STAND_IN_NUMBERS = 999;

function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

/** The 32-bit FNV-1a hash of `id` folded into 1 to 999, so a thing keeps its number on every screen, list and reload. */
export function standInNumberFor(id: string): number {
  return (fnv1a(id) % STAND_IN_NUMBERS) + 1;
}

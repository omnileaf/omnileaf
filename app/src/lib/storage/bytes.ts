import { getLocale } from "#lib/paraglide/runtime.js";

const GIGABYTE = 1_000_000_000;
const MEGABYTE = 1_000_000;

function inUnit(
  amount: number,
  unit: "gigabyte" | "megabyte",
  fractionDigits: number,
): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function formatBytes(bytes: number): string {
  if (bytes >= GIGABYTE) {
    return inUnit(bytes / GIGABYTE, "gigabyte", 1);
  }
  return inUnit(bytes / MEGABYTE, "megabyte", bytes < MEGABYTE ? 1 : 0);
}

import type { ClassValue } from "svelte/elements";

export interface MacTableRowPick {
  readonly isPicked: boolean;
  readonly isAbovePicked: boolean;
  readonly isBelowPicked: boolean;
}

export interface MacTableRowLook {
  readonly row: ClassValue;
  readonly cell: string;
  readonly progress: string;
}

const PICKED_ROW = "rounded-native-table-row bg-accent text-on-accent";

const PROGRESS_ON_ACCENT =
  "[--primary:var(--primary-foreground)] [--accent-fill:var(--on-accent-fill)]";

export function macTableRowLook(
  { isPicked, isAbovePicked, isBelowPicked }: MacTableRowPick,
  isStriped: boolean,
): MacTableRowLook {
  if (!isPicked) {
    return {
      row: isStriped ? "bg-hover" : "",
      cell: "text-muted",
      progress: "",
    };
  }
  return {
    row: [
      PICKED_ROW,
      isAbovePicked ? "rounded-t-none" : "",
      isBelowPicked ? "rounded-b-none" : "",
    ],
    cell: "",
    progress: PROGRESS_ON_ACCENT,
  };
}

import { SECTION_ROUTES } from "./sections";

export type HistoryMove =
  | { readonly kind: "push" }
  | { readonly kind: "back"; readonly steps: number }
  | { readonly kind: "replace"; readonly stepsBack: number };

/** The pages back passes through to leave `pathname`, from Library down to the page itself. */
function wayUp(pathname: string): readonly string[] {
  const segments = pathname.split("/").filter(Boolean);
  return [
    SECTION_ROUTES.library,
    ...segments.map((_, index) => `/${segments.slice(0, index + 1).join("/")}`),
  ];
}

/** How many entries, from the first, lie in order on `way`, which may pass levels the history never held, such as Settings beside its open section. */
function lengthOnTheWay(
  entries: readonly string[],
  way: readonly string[],
): number {
  let wayIndex = 0;
  let length = 0;
  for (const entry of entries) {
    const found = way.indexOf(entry, wayIndex);
    if (found === -1) {
      break;
    }
    wayIndex = found + 1;
    length += 1;
  }
  return length;
}

/** Plans how to reach `target` so the history entries end up as its way up, as far as the entries allow. */
export function moveTo(
  entries: readonly string[],
  target: string,
): HistoryMove {
  const onTheWay = lengthOnTheWay(entries, wayUp(target));
  if (onTheWay === entries.length) {
    return { kind: "push" };
  }
  if (entries[onTheWay - 1] === target) {
    return { kind: "back", steps: entries.length - onTheWay };
  }
  return {
    kind: "replace",
    stepsBack: Math.max(entries.length - onTheWay - 1, 0),
  };
}

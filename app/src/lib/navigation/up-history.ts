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

function sharedLength(
  entries: readonly string[],
  way: readonly string[],
): number {
  const firstDifference = entries.findIndex(
    (entry, index) => entry !== way[index],
  );
  return firstDifference === -1
    ? Math.min(entries.length, way.length)
    : firstDifference;
}

/** Plans how to reach `target` so the history entries end up as its way up, as far as the entries allow. */
export function moveTo(
  entries: readonly string[],
  target: string,
): HistoryMove {
  const way = wayUp(target);
  const shared = sharedLength(entries, way);
  if (shared === entries.length) {
    return { kind: "push" };
  }
  if (shared === way.length) {
    return { kind: "back", steps: entries.length - shared };
  }
  return {
    kind: "replace",
    stepsBack: Math.max(entries.length - shared - 1, 0),
  };
}

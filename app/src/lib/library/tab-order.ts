/** The tabs with the one at `from` moved to `to`, or the same tabs when `to` falls outside them. */
export function moved<T>(
  tabs: readonly T[],
  from: number,
  to: number,
): readonly T[] {
  const tab = tabs[from];
  if (tab === undefined || to < 0 || to >= tabs.length || to === from) {
    return tabs;
  }
  const rest = tabs.toSpliced(from, 1);
  return rest.toSpliced(to, 0, tab);
}

export function shownAs<T extends { readonly isHidden: boolean }>(
  tabs: readonly T[],
  at: number,
  isShown: boolean,
): readonly T[] {
  return tabs.map((tab, index) =>
    index === at ? { ...tab, isHidden: !isShown } : tab,
  );
}

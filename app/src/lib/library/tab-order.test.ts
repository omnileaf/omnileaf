import { expect, test } from "vitest";

import { moved, shownAs } from "./tab-order.ts";

const TABS = ["all", "new", "reading", "manga"].map((name) => ({
  name,
  isHidden: false,
}));

function names(tabs: readonly { name: string }[]): string[] {
  return tabs.map(({ name }) => name);
}

test("moves a tab to the place asked, the rest closing up behind it", () => {
  expect(names(moved(TABS, 3, 1))).toEqual(["all", "manga", "new", "reading"]);
  expect(names(moved(TABS, 0, 2))).toEqual(["new", "reading", "all", "manga"]);
});

test("keeps the tabs as they are for a place past either end", () => {
  expect(moved(TABS, 0, -1)).toBe(TABS);
  expect(moved(TABS, 3, 4)).toBe(TABS);
});

test("hides or shows only the tab asked", () => {
  const hidden = shownAs(TABS, 2, false);

  expect(hidden.map(({ isHidden }) => isHidden)).toEqual([
    false,
    false,
    true,
    false,
  ]);
});

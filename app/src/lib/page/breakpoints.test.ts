import { expect, test } from "vitest";

import theme from "../../app.css?raw";
import {
  EXPANDED_QUERY,
  MEDIUM_QUERY,
  NARROW_POINTER_QUERY,
  paneFoldQuery,
  WINDOWS_PANE_WIDTH,
} from "./breakpoints";

test("matches the expanded breakpoint the stylesheet uses", () => {
  const expandedWidth = /--breakpoint-expanded:\s*([^;]+);/.exec(theme)?.[1];

  expect(EXPANDED_QUERY).toBe(`(min-width: ${String(expandedWidth)})`);
});

test("matches the medium breakpoint the stylesheet uses", () => {
  const mediumWidth = /--breakpoint-medium:\s*([^;]+);/.exec(theme)?.[1];

  expect(MEDIUM_QUERY).toBe(`(min-width: ${String(mediumWidth)})`);
});

function matchesInWindowOf(width: number, query: string): boolean {
  const frame = document.createElement("iframe");
  frame.style.border = "0";
  frame.style.width = `${String(width)}px`;
  document.body.append(frame);
  const matches = frame.contentWindow?.matchMedia(query).matches;
  frame.remove();
  if (matches === undefined) {
    throw new Error("the test frame has no window");
  }
  return matches;
}

function stylesheetPaneWidth(): number {
  return Number(/--breakpoint-pane:\s*(\d+)px;/.exec(theme)?.[1] ?? Number.NaN);
}

test("matches the pane breakpoint the stylesheet uses", () => {
  expect(WINDOWS_PANE_WIDTH).toBe(stylesheetPaneWidth());
});

test("folds Windows' pane up to the width where the stylesheet opens it", () => {
  const query = paneFoldQuery("windows");

  expect({
    justUnder: matchesInWindowOf(WINDOWS_PANE_WIDTH - 1, query),
    atWidth: matchesInWindowOf(WINDOWS_PANE_WIDTH, query),
    wide: matchesInWindowOf(WINDOWS_PANE_WIDTH + 272, query),
  }).toEqual({ justUnder: true, atWidth: false, wide: false });
});

test("keeps the other platforms' pane fold at the narrow pointer query", () => {
  expect(paneFoldQuery("macos")).toBe(NARROW_POINTER_QUERY);
});

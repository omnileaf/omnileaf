import { expect, test } from "vitest";

import theme from "../../app.css?raw";
import { EXPANDED_QUERY, MEDIUM_QUERY } from "./breakpoints";

test("matches the expanded breakpoint the stylesheet uses", () => {
  const expandedWidth = /--breakpoint-expanded:\s*([^;]+);/.exec(theme)?.[1];

  expect(EXPANDED_QUERY).toBe(`(min-width: ${String(expandedWidth)})`);
});

test("matches the medium breakpoint the stylesheet uses", () => {
  const mediumWidth = /--breakpoint-medium:\s*([^;]+);/.exec(theme)?.[1];

  expect(MEDIUM_QUERY).toBe(`(min-width: ${String(mediumWidth)})`);
});

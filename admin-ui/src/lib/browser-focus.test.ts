import { afterEach, expect, test, vi } from "vitest";

import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("focuses the first level heading inside main of the document", () => {
  const focus = vi.fn();
  const querySelector = vi.fn(() => ({ focus }));
  vi.stubGlobal("document", { querySelector });

  focusPageHeadingInDocument();

  expect(querySelector).toHaveBeenCalledWith("main h1");
  expect(focus).toHaveBeenCalledOnce();
});

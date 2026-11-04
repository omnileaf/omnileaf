import { afterEach, expect, test, vi } from "vitest";

import {
  focusMoveTarget,
  focusPageHeadingInDocument,
} from "#lib/browser-focus.ts";

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

test("focuses the element a move names by its id", () => {
  const focus = vi.fn();
  const getElementById = vi.fn(() => ({ focus }));
  vi.stubGlobal("document", { getElementById });

  focusMoveTarget({ kind: "element", id: "move-issue" });

  expect(getElementById).toHaveBeenCalledWith("move-issue");
  expect(focus).toHaveBeenCalledOnce();
});

test("focuses the page heading when a move names it", () => {
  const focus = vi.fn();
  vi.stubGlobal("document", { querySelector: () => ({ focus }) });

  focusMoveTarget({ kind: "heading" });

  expect(focus).toHaveBeenCalledOnce();
});

test("does nothing when the named element is gone", () => {
  vi.stubGlobal("document", { getElementById: () => null });

  expect(() => {
    focusMoveTarget({ kind: "element", id: "move-issue" });
  }).not.toThrow();
});

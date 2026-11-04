import { afterEach, expect, test, vi } from "vitest";

import { browserClipboard } from "#lib/browser-clipboard.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("hands over the clipboard the browser offers", () => {
  const clipboard = { writeText: () => Promise.resolve() };
  vi.stubGlobal("navigator", { clipboard });

  expect(browserClipboard()).toBe(clipboard);
});

test("hands over nothing when the browser offers no clipboard", () => {
  vi.stubGlobal("navigator", {});

  expect(browserClipboard()).toBeUndefined();
});

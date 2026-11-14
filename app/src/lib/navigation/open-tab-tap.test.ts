import { expect, test } from "vitest";

import { openTabTap } from "./open-tab-tap";

test("does nothing while the setting is off, wherever the page is", () => {
  const tap = openTabTap({
    isTurnedOn: false,
    isScrolled: true,
    isOnFirstPage: false,
  });

  expect(tap).toBe("nothing");
});

test("scrolls a scrolled page back to its top first", () => {
  const tap = openTabTap({
    isTurnedOn: true,
    isScrolled: true,
    isOnFirstPage: false,
  });

  expect(tap).toBe("scrollToTop");
});

test("scrolls the scrolled first page to its top", () => {
  const tap = openTabTap({
    isTurnedOn: true,
    isScrolled: true,
    isOnFirstPage: true,
  });

  expect(tap).toBe("scrollToTop");
});

test("goes to the section's first page from the top of a page inside it", () => {
  const tap = openTabTap({
    isTurnedOn: true,
    isScrolled: false,
    isOnFirstPage: false,
  });

  expect(tap).toBe("firstPage");
});

test("does nothing at the top of the section's first page", () => {
  const tap = openTabTap({
    isTurnedOn: true,
    isScrolled: false,
    isOnFirstPage: true,
  });

  expect(tap).toBe("nothing");
});

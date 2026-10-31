import { expect, test } from "vitest";

import { TabScroll } from "./tab-scroll";

test("gives back where each tab was left, whichever was left last", () => {
  const scroll = new TabScroll();
  scroll.remember("manga", 640);
  scroll.remember("comics", 120);

  expect([scroll.recall("manga"), scroll.recall("comics")]).toEqual([640, 120]);
});

test("starts a tab nobody scrolled at the top", () => {
  expect(new TabScroll().recall("manga")).toBe(0);
});

test("forgets every tab's place at once", () => {
  const scroll = new TabScroll();
  scroll.remember("manga", 640);

  scroll.forgetAll();

  expect(scroll.recall("manga")).toBe(0);
});

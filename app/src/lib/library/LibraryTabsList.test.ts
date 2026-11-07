import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import type { ArrangedTab } from "./library-tabs.ts";
import LibraryTabsList from "./LibraryTabsList.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const TABS: readonly ArrangedTab[] = [
  { id: { kind: "all" }, name: "All", isHidden: false },
  { id: { kind: "newChapters" }, name: "New chapters", isHidden: true },
];

const PROPS = {
  tabs: TABS,
  detailOf: () => "Built in",
  onArrange: () => undefined,
};

function element(selector: string, within: ParentNode): HTMLElement {
  const found = within.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`nothing matches ${selector}`);
  }
  return found;
}

test("draws the Android drag handle and More button as 40px buttons with bare 24px Material icons", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const row = element("[data-tab-row]", screen.container);
  const handle = element("[data-tab-handle]", row);
  const more = element("button[aria-label^='More for']", row);
  const grip = element("[data-icon=grip-vertical]", handle);
  const dots = element("[data-icon=ellipsis]", more);

  expect(handle.getBoundingClientRect().width).toBeCloseTo(40, 0);
  expect(more.getBoundingClientRect().width).toBeCloseTo(40, 0);
  expect(more.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(
    parseFloat(getComputedStyle(more).borderRadius),
  ).toBeGreaterThanOrEqual(20);
  expect(grip.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(dots.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(row.querySelector("svg")).toBeNull();
});

test("sets the Android Hidden badge without a border, 12px medium on a filled 8px corner", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const badge = element("[data-tab-badge]", screen.container);
  const style = getComputedStyle(badge);
  const icon = element("[data-icon=eye-off]", badge);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderRadius).toBe("8px");
  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("500");
  expect(style.letterSpacing).toBe("0.5px");
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(badge.getBoundingClientRect().height).toBeCloseTo(24, 0);
  expect(icon.getBoundingClientRect().width).toBeCloseTo(14, 0);
});

test("sets the Android tab name with 0.5px tracking", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const name = screen.getByText("All", { exact: true }).element();

  expect(getComputedStyle(name).letterSpacing).toBe("0.5px");
});

test("keeps the outlined Hidden badge and Lucide icons off Android", async () => {
  const screen = await render(LibraryTabsList, PROPS);

  const badge = element("[data-tab-badge]", screen.container);

  expect(getComputedStyle(badge).borderTopWidth).toBe("1px");
  expect(screen.container.querySelector("[data-icon]")).toBeNull();
});

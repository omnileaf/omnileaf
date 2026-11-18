import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

const ANDROID_PHONE = { width: 390, height: 844 };
const SPARE = 1;

const OPTIONS = ["all", "unread", "bookmarked"] as const;
type Option = (typeof OPTIONS)[number];

const LABELS = {
  all: () => "All",
  unread: () => "Unread",
  bookmarked: () => "Bookmarked",
} satisfies Record<Option, () => string>;

const NAMES = Object.values(LABELS).map((label) => label());

async function renderShowChoice(): Promise<HTMLElement> {
  followCorePlatform("android");
  await page.viewport(ANDROID_PHONE.width, ANDROID_PHONE.height);
  const heading = document.createElement("h2");
  heading.id = "show-heading";
  heading.textContent = "Show";
  document.body.append(heading);
  const screen = await render(SegmentedControl<Option>, {
    options: OPTIONS,
    labels: LABELS,
    chosen: "all",
    labelledBy: "show-heading",
    size: "small",
    isFullWidth: true,
    spansLastRow: true,
    fitsOneRowByWidest: true,
    onChoose: () => undefined,
  });
  return screen.container;
}

function asElement(node: Node): HTMLElement {
  if (!(node instanceof HTMLElement)) {
    throw new Error("the segmented control drew no element");
  }
  return node;
}

function segment(name: string): HTMLElement {
  return asElement(page.getByRole("radio", { name }).element());
}

function track(): HTMLElement {
  return asElement(page.getByRole("radiogroup", { name: "Show" }).element());
}

function ownWidth(name: string): number {
  const alone = asElement(segment(name).cloneNode(true));
  alone.style.position = "absolute";
  track().append(alone);
  const width = alone.getBoundingClientRect().width;
  alone.remove();
  return width;
}

function roomFor(widths: readonly number[]): number {
  const style = getComputedStyle(track());
  return (
    widths.reduce((sum, width) => sum + width, 0) +
    (widths.length - 1) * Number.parseFloat(style.columnGap) +
    Number.parseFloat(style.paddingInlineStart) +
    Number.parseFloat(style.paddingInlineEnd) +
    SPARE
  );
}

function rows(): string[][] {
  const tops = [...new Set(NAMES.map((name) => segment(name).offsetTop))];
  return tops.map((top) =>
    NAMES.filter((name) => segment(name).offsetTop === top),
  );
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("wraps Android's segments into two columns, the last across both, once three of the widest no longer fit though their own widths would", async () => {
  const container = await renderShowChoice();
  const room = roomFor(NAMES.map(ownWidth));

  container.style.inlineSize = `${String(room)}px`;

  await expect.poll(rows).toEqual([["All", "Unread"], ["Bookmarked"]]);
});

test("keeps Android's segments on one row at their own widths while three of the widest fit", async () => {
  const container = await renderShowChoice();
  const widths = NAMES.map(ownWidth);
  const widest = Math.max(...widths);
  container.style.inlineSize = `${String(roomFor(widths))}px`;
  await expect.poll(rows).toEqual([["All", "Unread"], ["Bookmarked"]]);

  container.style.inlineSize = `${String(roomFor(NAMES.map(() => widest)))}px`;

  await expect.poll(rows).toEqual([NAMES]);
  expect(segment("All").getBoundingClientRect().width).toBeLessThan(
    segment("Bookmarked").getBoundingClientRect().width,
  );
});

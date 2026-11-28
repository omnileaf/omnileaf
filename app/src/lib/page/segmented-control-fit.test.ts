import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

const ANDROID_PHONE = { width: 390, height: 844 };
const SPARE = 1;
const SUBPIXEL_SHORTFALL = 0.25;
const ROOM_BESIDE_NAME = 20;

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

async function renderAtRowEnd(): Promise<HTMLElement> {
  followCorePlatform("android");
  await page.viewport(ANDROID_PHONE.width, ANDROID_PHONE.height);
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  const heading = document.createElement("h2");
  heading.id = "show-heading";
  heading.textContent = "Show";
  row.append(heading);
  document.body.append(row);
  await render(SegmentedControl<Option>, {
    target: row,
    props: {
      options: OPTIONS,
      labels: LABELS,
      chosen: "all",
      labelledBy: "show-heading",
      size: "small",
      isAtRowEnd: true,
      class: "max-inline-full",
      onChoose: () => undefined,
    },
  });
  return row;
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

test("rounds Android's wrapped segments to half their height, so a press can tighten them smoothly", async () => {
  const container = await renderShowChoice();
  container.style.inlineSize = `${String(roomFor(NAMES.map(ownWidth)))}px`;
  await expect.poll(rows).toEqual([["All", "Unread"], ["Bookmarked"]]);

  const all = segment("All");
  for (const animation of all.getAnimations()) {
    animation.finish();
  }

  expect(getComputedStyle(all).borderTopLeftRadius).toBe(
    `${String(all.getBoundingClientRect().height / 2)}px`,
  );
});

test("puts a group at its row's end back on one row once the row has room again", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);
  row.style.inlineSize = `${String(Math.max(...widths))}px`;
  await expect.poll(() => rows().length).toBe(NAMES.length);

  row.style.inlineSize = `${String(roomFor(widths))}px`;

  await expect.poll(rows).toEqual([NAMES]);
});

test("gives a group at its row's end a line of its own across the row once it no longer fits on one row", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);

  row.style.inlineSize = `${String(roomFor(widths) - SPARE * 2)}px`;

  await expect.poll(() => rows().length).toBeGreaterThan(1);
  expect(track().getBoundingClientRect().width).toBeCloseTo(
    row.getBoundingClientRect().width,
    0,
  );
  expect(track().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    asElement(row.firstElementChild ?? row).getBoundingClientRect().bottom,
  );
});

test("keeps a group at its row's end on one row when the row has not a pixel to spare", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);
  row.style.inlineSize = `${String(Math.max(...widths))}px`;
  await expect.poll(() => rows().length).toBe(NAMES.length);

  row.style.inlineSize = `${String(roomFor(widths) - SPARE)}px`;

  await expect.poll(rows).toEqual([NAMES]);
});

test("gives a group at its row's end a line of its own when the row is a quarter pixel short", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);

  row.style.inlineSize = `${String(roomFor(widths) - SPARE - SUBPIXEL_SHORTFALL)}px`;

  await expect.poll(() => rows().length).toBeGreaterThan(1);
  expect(track().getBoundingClientRect().width).toBeCloseTo(
    row.getBoundingClientRect().width,
    0,
  );
});

test("gives a group at its row's end the whole line once it wraps under its name, though it still fits one row", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);

  row.style.inlineSize = `${String(roomFor(widths) + ROOM_BESIDE_NAME)}px`;

  await expect
    .poll(() => track().getBoundingClientRect().width)
    .toBeCloseTo(row.getBoundingClientRect().width, 0);
  expect(rows()).toEqual([NAMES]);
  expect(track().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    asElement(row.firstElementChild ?? row).getBoundingClientRect().bottom,
  );
});

test("hands the whole line back once a wrapped group at its row's end fits beside its name again", async () => {
  const row = await renderAtRowEnd();
  const widths = NAMES.map(ownWidth);
  row.style.inlineSize = `${String(roomFor(widths) + ROOM_BESIDE_NAME)}px`;
  await expect
    .poll(() => track().getBoundingClientRect().width)
    .toBeCloseTo(row.getBoundingClientRect().width, 0);

  row.style.inlineSize = `${String(roomFor(widths) * 2)}px`;

  await expect
    .poll(() => track().getBoundingClientRect().width)
    .toBeCloseTo(roomFor(widths) - SPARE, 0);
  expect(track().getBoundingClientRect().top).toBeLessThan(
    asElement(row.firstElementChild ?? row).getBoundingClientRect().bottom,
  );
});

test("moves Android's label-hugging segments off one row once their drawn labels no longer fit it", async () => {
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
    hugsLabels: true,
    class: "max-inline-full",
    onChoose: () => undefined,
  });
  const widths = NAMES.map(ownWidth);

  screen.container.style.inlineSize = `${String(roomFor(widths) - SPARE * 2)}px`;

  await expect.poll(() => rows().length).toBeGreaterThan(1);
});

import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import StripScrubberHarness from "./StripScrubberHarness.svelte";

const PHONE = { width: 400, height: 800 };
const SIDE_GAP = 8;
const TOP_BAR = 64;
const BAR_GAP = 16;
const PANEL_ROOM = 140;
const SCRUBBER_WIDTH = 48;
const TRACK_INSET = 16;
const TRACK_WIDTH = 16;
const HANDLE = { width: 44, height: 4 };
const COUNT_GAP = 8;
const HALF = 0.5;
const TRACK_GAP = 6;

const LAST_PAGE = 63;

async function openScrubber(
  progress: number,
  props: {
    shown?: number;
    onScrub?: (along: number) => void;
    onSeek?: (index: number) => void;
  } = {},
  direction: "ltr" | "rtl" = "ltr",
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform("android");
  document.documentElement.dataset.theme = "light";
  document.documentElement.dir = direction;
  await page.viewport(PHONE.width, PHONE.height);
  await render(StripScrubberHarness, { progress, ...props });
}

function box(selector: string): DOMRect {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the scrubber drew no ${selector}`);
  }
  return element.getBoundingClientRect();
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("dir");
  document.body.replaceChildren();
});

test("runs a 48 wide scrubber down the right edge between the bars", async () => {
  await openScrubber(HALF);
  const scrubber = box("[data-scrubber]");

  expect(scrubber.width).toBe(SCRUBBER_WIDTH);
  expect(scrubber.right).toBe(PHONE.width - SIDE_GAP);
  expect(scrubber.top).toBe(TOP_BAR + BAR_GAP);
  expect(scrubber.bottom).toBe(PHONE.height - PANEL_ROOM - BAR_GAP);
});

test("draws a 44 by 4 bar handle at the page along a 16 wide track", async () => {
  await openScrubber(HALF);
  const scrubber = box("[data-scrubber]");
  const handle = box("[data-scrubber-handle]");

  expect([handle.width, handle.height]).toEqual([HANDLE.width, HANDLE.height]);
  expect(handle.top + handle.height / 2).toBeCloseTo(
    scrubber.top + TRACK_INSET + (scrubber.height - 2 * TRACK_INSET) * HALF,
    0,
  );
  expect(box("[data-scrubber-range]").width).toBe(TRACK_WIDTH);
  expect(
    getComputedStyle(
      document.querySelector("[data-scrubber-handle]") as Element,
    ).backgroundColor,
  ).toBe(resolvedColour("--native-color-button-primary", "backgroundColor"));
});

test("puts the page count in a pill beside the handle", async () => {
  await openScrubber(HALF);
  const scrubber = box("[data-scrubber]");
  const count = box("[data-scrubber-count]");
  const handle = box("[data-scrubber-handle]");

  expect(count.right).toBe(scrubber.left - COUNT_GAP);
  expect(count.top + count.height / 2).toBeCloseTo(
    handle.top + handle.height / 2,
    0,
  );
  expect(
    page.getByRole("slider").element().getAttribute("aria-valuetext"),
  ).toBe("Page 41 of 64");
});

test("moves the handle down the scrubber as the strip scrolls", async () => {
  await openScrubber(0);
  const first = box("[data-scrubber-handle]").top;
  await openScrubber(1);

  expect(box("[data-scrubber-handle]").top).toBeGreaterThan(first);
});

test("splits the track around the handle with a six pixel gap each side", async () => {
  await openScrubber(HALF);
  const handle = box("[data-scrubber-handle]");
  const [range, rest] = ["[data-scrubber-range]", "[data-scrubber-rest]"].map(
    box,
  );

  expect(handle.top + handle.height / 2 - (range?.bottom ?? 0)).toBeCloseTo(
    TRACK_GAP,
    0,
  );
  expect((rest?.top ?? 0) - (handle.top + handle.height / 2)).toBeCloseTo(
    TRACK_GAP,
    0,
  );
});

function press(offset: number): Promise<void> {
  const scrubber = box("[data-scrubber]");
  return userEvent.click(
    page.elementLocator(document.querySelector("[data-scrubber]") as Element),
    { position: { x: scrubber.width / 2, y: offset } },
  );
}

test("scrolls to the very start when the press lands on the start of the track", async () => {
  const onScrub = vi.fn();
  await openScrubber(HALF, { onScrub });

  await press(TRACK_INSET);

  expect(onScrub).toHaveBeenLastCalledWith(0);
});

test("scrolls to the very end when the press lands on the end of the track", async () => {
  const onScrub = vi.fn();
  await openScrubber(HALF, { onScrub });
  const scrubber = box("[data-scrubber]");

  await press(scrubber.height - TRACK_INSET - 1);

  expect(onScrub.mock.lastCall?.[0]).toBeCloseTo(1, 2);
});

test("scrolls to the middle when the press lands on the middle of the track", async () => {
  const onScrub = vi.fn();
  await openScrubber(0, { onScrub });
  const scrubber = box("[data-scrubber]");

  await press(scrubber.height / 2);

  expect(onScrub.mock.lastCall?.[0]).toBeCloseTo(HALF, 2);
});

test("scrolls along as the handle is dragged to the end", async () => {
  const onScrub = vi.fn();
  await openScrubber(0, { onScrub, shown: 0 });
  const scrubber = box("[data-scrubber]");
  const track = page.elementLocator(
    document.querySelector("[data-scrubber]") as Element,
  );

  await userEvent.dragAndDrop(track, track, {
    sourcePosition: { x: scrubber.width / 2, y: TRACK_INSET },
    targetPosition: { x: scrubber.width / 2, y: scrubber.height - 1 },
  });

  expect(onScrub).toHaveBeenLastCalledWith(1);
});

test("moves to the left edge and keeps scrolling with the page laid out right to left", async () => {
  const onScrub = vi.fn();
  await openScrubber(HALF, { onScrub }, "rtl");
  const scrubber = box("[data-scrubber]");

  await press(scrubber.height - TRACK_INSET - 1);

  expect(onScrub.mock.lastCall?.[0]).toBeCloseTo(1, 2);
  expect(box("[data-scrubber]").left).toBe(SIDE_GAP);
});

test("steps one page with the arrow keys", async () => {
  const onSeek = vi.fn();
  await openScrubber(HALF, { onSeek, shown: 10 });
  page.getByRole("slider").element().focus();

  await userEvent.keyboard("{ArrowDown}");
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.keyboard("{ArrowUp}");
  await userEvent.keyboard("{ArrowLeft}");

  expect(onSeek.mock.calls).toEqual([[11], [11], [9], [9]]);
});

test("does not step past the first page", async () => {
  const onSeek = vi.fn();
  await openScrubber(0, { onSeek, shown: 0 });
  page.getByRole("slider").element().focus();

  await userEvent.keyboard("{ArrowUp}");

  expect(onSeek).not.toHaveBeenCalled();
});

test("does not step past the last page", async () => {
  const onSeek = vi.fn();
  await openScrubber(1, { onSeek, shown: LAST_PAGE });
  page.getByRole("slider").element().focus();

  await userEvent.keyboard("{ArrowDown}");

  expect(onSeek).not.toHaveBeenCalled();
});

test("jumps to the start and the end with Home and End", async () => {
  const onScrub = vi.fn();
  await openScrubber(HALF, { onScrub });
  page.getByRole("slider").element().focus();

  await userEvent.keyboard("{End}");
  await userEvent.keyboard("{Home}");

  expect(onScrub.mock.calls).toEqual([[1], [0]]);
});

test("steps one page with PageDown and PageUp", async () => {
  const onSeek = vi.fn();
  const onScrub = vi.fn();
  await openScrubber(HALF, { onSeek, onScrub, shown: 10 });
  page.getByRole("slider").element().focus();

  await userEvent.keyboard("{PageDown}");
  await userEvent.keyboard("{PageUp}");

  expect(onSeek.mock.calls).toEqual([[11], [9]]);
  expect(onScrub).not.toHaveBeenCalled();
});

test("does nothing when the press lands in the margin above or below the track", async () => {
  const onScrub = vi.fn();
  await openScrubber(HALF, { onScrub });
  const scrubber = box("[data-scrubber]");

  await press(TRACK_INSET / 2);
  await press(scrubber.height - TRACK_INSET / 2);

  expect(onScrub).not.toHaveBeenCalled();
});

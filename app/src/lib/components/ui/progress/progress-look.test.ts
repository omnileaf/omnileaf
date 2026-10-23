import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import Progress from "./progress.svelte";

async function renderBar(value: number, max = 100): Promise<HTMLElement> {
  document.documentElement.dataset.theme = "light";
  const screen = await render(Progress, {
    value,
    max,
    "aria-label": "Reading",
  });
  const bar = screen.getByRole("progressbar", { name: "Reading" }).element();
  if (!(bar instanceof HTMLElement)) {
    throw new Error("the progress bar drew no element");
  }
  return bar;
}

function partsOf(bar: HTMLElement): readonly DOMRect[] {
  return [...bar.children].map((part) => part.getBoundingClientRect());
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("draws iOS's thin bar as an accent fill on the control fill", async () => {
  followCorePlatform("ios");
  const bar = await renderBar(32);

  const [fill] = [...bar.children];

  expect(getComputedStyle(bar).backgroundColor).toBe(
    "rgba(118, 118, 128, 0.12)",
  );
  expect(fill && getComputedStyle(fill).backgroundColor).toBe(
    "rgb(47, 111, 79)",
  );
  expect(partsOf(bar)[0]?.width).toBeCloseTo(
    bar.getBoundingClientRect().width * 0.32,
    0,
  );
});

test("draws Android's fill and the rest of the track as two pills with a gap", async () => {
  followCorePlatform("android");
  const bar = await renderBar(32);

  const [fill, rest] = [...bar.children];
  const [fillBox, restBox] = partsOf(bar);

  expect(getComputedStyle(bar).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(fill && getComputedStyle(fill).backgroundColor).toBe(
    "rgb(50, 106, 77)",
  );
  expect(rest && getComputedStyle(rest).backgroundColor).toBe(
    "rgb(208, 232, 215)",
  );
  expect((restBox?.left ?? 0) - (fillBox?.right ?? 0)).toBeCloseTo(4, 0);
});

test("fills the whole native bar when there was nothing to do", async () => {
  followCorePlatform("ios");
  const bar = await renderBar(0, 0);

  const fill = partsOf(bar)[0];

  expect(fill?.width).toBeCloseTo(bar.getBoundingClientRect().width, 0);
});

test("starts Android's empty bar at its edge, with no gap before the track", async () => {
  followCorePlatform("android");
  const bar = await renderBar(0);

  const parts = partsOf(bar);

  expect(parts).toHaveLength(1);
  expect(parts[0]?.left).toBeCloseTo(bar.getBoundingClientRect().left, 0);
});

test("runs Android's loading band in the fill colour on the soft accent track", async () => {
  followCorePlatform("android");
  document.documentElement.dataset.theme = "light";
  const screen = await render(Progress, {
    value: null,
    "aria-label": "Finding books",
  });

  const bar = screen
    .getByRole("progressbar", { name: "Finding books" })
    .element();

  const band = bar.firstElementChild;

  expect(getComputedStyle(bar).backgroundColor).toBe("rgb(208, 232, 215)");
  expect(band && getComputedStyle(band).backgroundColor).toBe(
    "rgb(50, 106, 77)",
  );
});

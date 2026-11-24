import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import AndroidBackLayers from "./AndroidBackLayers.svelte";
import { AndroidBackPreview } from "./android-back-preview.svelte";
import type { BackGestureAt } from "./back-preview";

const LIGHT_SCRIM = "0.2";
const EMPHASIZED_JOINT = { x: 0.166666, y: 0.4 };
const COPY = { content: document.createElement("div"), scrollTop: 0 };
const LOOK = { isDark: () => false, isMotionReduced: () => false };

function at(progress: number): BackGestureAt {
  return { progress, edge: "left", touchY: 0.5, cornerPx: 0 };
}

function pageOnScreen(): HTMLElement {
  const page = document.createElement("main");
  page.style.inlineSize = "400px";
  page.style.blockSize = "800px";
  document.body.append(page);
  return page;
}

async function shownWith(preview: AndroidBackPreview): Promise<Element> {
  const screen = await render(AndroidBackLayers, {
    preview,
    behind: undefined,
    cornerPx: 0,
  });
  return screen.container;
}

function easedAt(transition: string, x: number): number {
  const stops = (/linear\(([^)]*)\)/.exec(transition)?.[1] ?? "")
    .split(",")
    .map((stop) => Number(stop.trim().split(" ")[0]));
  const position = x * (stops.length - 1);
  const below = stops[Math.floor(position)] ?? Number.NaN;
  const above = stops[Math.ceil(position)] ?? Number.NaN;
  return below + (above - below) * (position - Math.floor(position));
}

function scrimOf(layers: Element): HTMLElement | null {
  return layers.querySelector("[data-previous-screen] > div:last-child");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("holds the scrim at Android's alpha however far the gesture moves", async () => {
  const preview = new AndroidBackPreview(LOOK);
  const page = pageOnScreen();
  const layers = await shownWith(preview);
  preview.follow({ kind: "started", at: at(0) }, page);
  preview.follow({ kind: "moved", at: at(0.1) }, page);
  flushSync();
  const early = scrimOf(layers)?.style.opacity;

  preview.follow({ kind: "moved", at: at(0.9) }, page);
  flushSync();

  expect([early, scrimOf(layers)?.style.opacity]).toEqual([
    LIGHT_SCRIM,
    LIGHT_SCRIM,
  ]);
  page.remove();
});

test("holds the scrim while the page springs back after a cancelled gesture", async () => {
  const preview = new AndroidBackPreview(LOOK);
  const page = pageOnScreen();
  const layers = await shownWith(preview);
  preview.follow({ kind: "started", at: at(0) }, page);
  preview.follow({ kind: "moved", at: at(0.6) }, page);

  preview.follow({ kind: "ended" }, page);
  flushSync();

  expect(preview.phase).toBe("cancelling");
  expect(scrimOf(layers)?.style.opacity).toBe(LIGHT_SCRIM);
  page.remove();
});

test("plays the page's leave on Android's emphasized curve", async () => {
  const preview = new AndroidBackPreview(LOOK);
  const page = pageOnScreen();
  const layers = await shownWith(preview);
  preview.follow({ kind: "started", at: at(0) }, page);
  preview.follow({ kind: "moved", at: at(0.6) }, page);

  preview.leave(COPY);
  flushSync();

  const leavingPage = layers.querySelector<HTMLElement>(
    "[data-leaving-screen] > div:last-child",
  );
  expect(
    easedAt(leavingPage?.style.transition ?? "", EMPHASIZED_JOINT.x),
  ).toBeCloseTo(EMPHASIZED_JOINT.y, 1);
  page.remove();
});

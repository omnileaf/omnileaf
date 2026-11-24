import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import AndroidBackLayers from "./AndroidBackLayers.svelte";
import { AndroidBackPreview } from "./android-back-preview.svelte";
import { ANDROID_BACK_MOTION, type BackGestureAt } from "./back-preview";

const SCRIM_SHOWN = "1";
const GONE = "opacity: 0;";
const EMPHASIZED_JOINT = { x: 0.166666, y: 0.4 };
const COPY = { content: document.createElement("div"), scrollTop: 0 };
const LOOK = { isMotionReduced: () => false };

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

function stylesShownIn(layers: Element): () => string[] {
  const watcher = new MutationObserver(() => undefined);
  watcher.observe(layers, {
    subtree: true,
    attributeFilter: ["style"],
    attributeOldValue: true,
  });
  return () =>
    watcher
      .takeRecords()
      .filter(({ target }) =>
        target instanceof Element
          ? target.closest("[data-leaving-screen]") !== null
          : false,
      )
      .map(({ oldValue }) => oldValue ?? "");
}

function scrimOf(layers: Element): HTMLElement | null {
  return layers.querySelector("[data-previous-screen] > div:last-child");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each([
  ["light", "rgba(0, 0, 0, 0.2)"],
  ["dark", "rgba(0, 0, 0, 0.8)"],
] as const)(
  "dims the page behind with Android's black scrim in the %s theme",
  async (theme, scrim) => {
    document.documentElement.dataset.platform = "android";
    document.documentElement.dataset.theme = theme;
    const preview = new AndroidBackPreview(LOOK);
    const page = pageOnScreen();
    const layers = await shownWith(preview);

    preview.follow({ kind: "started", at: at(0) }, page);
    preview.follow({ kind: "moved", at: at(0.5) }, page);
    flushSync();

    const shown = scrimOf(layers);
    expect([
      shown === null ? "" : getComputedStyle(shown).backgroundColor,
      shown?.style.opacity,
    ]).toEqual([scrim, "1"]);
    page.remove();
  },
);

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
    SCRIM_SHOWN,
    SCRIM_SHOWN,
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
  expect(scrimOf(layers)?.style.opacity).toBe(SCRIM_SHOWN);
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

test("shows each leave at its start before it plays", async () => {
  const preview = new AndroidBackPreview(LOOK);
  const page = pageOnScreen();
  const layers = await shownWith(preview);
  preview.follow({ kind: "started", at: at(0) }, page);
  preview.follow({ kind: "moved", at: at(0.6) }, page);
  preview.leave(COPY);
  flushSync();
  vi.advanceTimersByTime(ANDROID_BACK_MOTION.commitMs);
  flushSync();
  const shownStyles = stylesShownIn(layers);

  preview.follow({ kind: "started", at: at(0) }, page);
  preview.follow({ kind: "moved", at: at(0.6) }, page);
  preview.leave(COPY);
  flushSync();

  expect(shownStyles().filter((style) => style.includes(GONE))).toEqual([]);
  page.remove();
});

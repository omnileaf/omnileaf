import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import NavigationIcon from "./NavigationIcon.svelte";
import type { Section } from "./sections";

const SECTIONS: readonly Section[] = [
  "library",
  "browse",
  "history",
  "settings",
];
const SIZE = 24;
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

function filledShapes(container: Element): number {
  return Array.from(container.querySelectorAll("svg *")).filter(
    (shape) => shape.getAttribute("fill") === "currentColor",
  ).length;
}

test.each(SECTIONS)("draws the %s icon as decoration only", async (section) => {
  const screen = await render(NavigationIcon, {
    section,
    isSelected: false,
    isArriving: false,
    size: SIZE,
  });

  const icon = screen.container.querySelector("svg");

  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(icon?.getAttribute("width")).toBe(String(SIZE));
  expect(icon?.querySelectorAll("path, circle").length).toBeGreaterThan(0);
});

test.each(SECTIONS)(
  "outlines the %s icon when it isn't selected",
  async (section) => {
    const screen = await render(NavigationIcon, {
      section,
      isSelected: false,
      isArriving: false,
      size: SIZE,
    });

    expect(filledShapes(screen.container)).toBe(0);
  },
);

test.each(SECTIONS)("fills the %s icon when it's selected", async (section) => {
  const screen = await render(NavigationIcon, {
    section,
    isSelected: true,
    isArriving: false,
    size: SIZE,
  });

  expect(filledShapes(screen.container)).toBeGreaterThan(0);
});

test("keeps the clock's circular arrow drawn when the history icon is filled", async () => {
  const screen = await render(NavigationIcon, {
    section: "history",
    isSelected: true,
    isArriving: false,
    size: SIZE,
  });

  const shapes = Array.from(screen.container.querySelectorAll("svg *"));
  const drawnAsLines = shapes.filter((shape) => {
    const style = getComputedStyle(shape);
    return style.fill === "none" && style.stroke !== "none";
  });

  expect(filledShapes(screen.container)).toBe(1);
  expect(drawnAsLines.length).toBeGreaterThanOrEqual(2);
});

interface Glyph {
  readonly isFilled: boolean;
  readonly opacity: string;
}

function glyphsOf(container: Element): Glyph[] {
  return Array.from(container.querySelectorAll("[data-icon]")).map((glyph) => ({
    isFilled: glyph.hasAttribute("data-filled"),
    opacity: getComputedStyle(glyph).opacity,
  }));
}

const ANDROID_MOVES: Record<Section, string> = {
  library: "book-open",
  browse: "needle-swing",
  history: "clock-rewind",
  settings: "gear-turn",
};

test.each(SECTIONS)(
  "stacks an outlined and a filled %s glyph on Android, showing the outlined one when it isn't selected",
  async (section) => {
    followCorePlatform("android");
    const screen = await render(NavigationIcon, {
      section,
      isSelected: false,
      isArriving: false,
      size: SIZE,
    });

    expect(glyphsOf(screen.container)).toEqual([
      { isFilled: false, opacity: "1" },
      { isFilled: true, opacity: "0" },
    ]);
  },
);

test.each(SECTIONS)(
  "stacks an outlined and a filled %s glyph on Android, showing the filled one when it is selected",
  async (section) => {
    followCorePlatform("android");
    const screen = await render(NavigationIcon, {
      section,
      isSelected: true,
      isArriving: false,
      size: SIZE,
    });

    expect(glyphsOf(screen.container)).toEqual([
      { isFilled: false, opacity: "0" },
      { isFilled: true, opacity: "1" },
    ]);
  },
);

test.each(SECTIONS)(
  "moves both %s glyphs together on Android while the tab arrives",
  async (section) => {
    followCorePlatform("android");
    await page.viewport(PHONE_WIDTH, PHONE_HEIGHT);
    const screen = await render(NavigationIcon, {
      section,
      isSelected: true,
      isArriving: true,
      size: SIZE,
    });

    const box = screen.container.querySelector('[data-slot="navigation-icon"]');

    expect(box === null ? undefined : getComputedStyle(box).animationName).toBe(
      ANDROID_MOVES[section],
    );
  },
);

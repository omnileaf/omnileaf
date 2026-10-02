import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import NavigationIcon from "./NavigationIcon.svelte";
import type { Section } from "./sections";

const SECTIONS: readonly Section[] = [
  "library",
  "browse",
  "history",
  "settings",
];
const SIZE = 24;

function filledShapes(container: Element): number {
  return Array.from(container.querySelectorAll("svg *")).filter(
    (shape) => shape.getAttribute("fill") === "currentColor",
  ).length;
}

test.each(SECTIONS)("draws the %s icon as decoration only", async (section) => {
  const screen = await render(NavigationIcon, {
    section,
    isSelected: false,
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
      size: SIZE,
    });

    expect(filledShapes(screen.container)).toBe(0);
  },
);

test.each(SECTIONS)("fills the %s icon when it's selected", async (section) => {
  const screen = await render(NavigationIcon, {
    section,
    isSelected: true,
    size: SIZE,
  });

  expect(filledShapes(screen.container)).toBeGreaterThan(0);
});

test("keeps the clock's circular arrow drawn when the history icon is filled", async () => {
  const screen = await render(NavigationIcon, {
    section: "history",
    isSelected: true,
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

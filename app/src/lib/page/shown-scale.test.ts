import { expect, onTestFinished, test } from "vitest";

import { shownScaleOf } from "./shown-scale";

function placed(scale: string, inside: Element = document.body): HTMLElement {
  const element = document.createElement("div");
  element.style.transform = scale;
  inside.append(element);
  onTestFinished(() => {
    element.remove();
  });
  return element;
}

test("shows an element drawn without any transform at its own size", () => {
  const element = placed("none");

  expect(shownScaleOf(element)).toBe(1);
});

test("shows an element at the scale it is drawn at", () => {
  const element = placed("scale(0.5)");

  expect(shownScaleOf(element)).toBe(0.5);
});

test("shows an element inside scaled ancestors at the scales of them all together", () => {
  const outer = placed("translateX(-96px) scale(0.5)");
  const middle = placed("none", outer);
  const inner = placed("scale(0.5)", middle);

  expect(shownScaleOf(inner)).toBe(0.25);
});

import { expect, onTestFinished, test } from "vitest";

import { laidOutSize, measurableScaleOf, shownScaleOf } from "./shown-scale";

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

test("measures an element drawn at a scale above zero", () => {
  const element = placed("scale(0.5)");

  expect(measurableScaleOf(element)).toBe(0.5);
});

test("measures nothing of an element drawn at no size", () => {
  const element = placed("scale(0)");

  expect(measurableScaleOf(element)).toBeUndefined();
});

test("measures nothing of an element drawn mirrored", () => {
  const element = placed("scaleY(-1)");

  expect(measurableScaleOf(element)).toBeUndefined();
});

test("gives back the exact laid out size of a size measured through an uneven scale", () => {
  const scale = 0.906185;
  const laidOut = 200.03125;

  const size = laidOutSize(laidOut * scale, scale);

  expect(size).toBe(laidOut);
});

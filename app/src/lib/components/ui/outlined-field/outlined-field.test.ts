import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import OutlinedFieldHarness from "./OutlinedFieldHarness.svelte";

const FIELD_HEIGHT = 56;
const FIELD_CORNER = "4px";
const LABEL_SIZE = "12px";
const LABEL_LINE = "16px";
const LABEL_TRACKING = "0.4px";
const LABEL_INSET = 12;
const CONTROL_INLINE_PADDING = 16;

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function drawField() {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await page.viewport(400, 800);
  await render(OutlinedFieldHarness);
  const box = document.querySelector("[data-slot='outlined-field']");
  const label = page.getByText("Title", { exact: true }).element();
  const control = page.getByRole("textbox").element();
  if (box === null) {
    throw new Error("the field drew no box");
  }
  return { box, label, control };
}

test("draws a 56px box with a 4px corner and a 1px outline", async () => {
  const { box } = await drawField();
  const style = getComputedStyle(box);

  expect(box.getBoundingClientRect().height).toBe(FIELD_HEIGHT);
  expect(style.borderTopLeftRadius).toBe(FIELD_CORNER);
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(
    resolvedColour("--native-color-button-outline-edge", "backgroundColor"),
  );
});

test("floats the label on the top edge, 12px in, at 12px on a 16px line", async () => {
  const { box, label } = await drawField();
  const style = getComputedStyle(label);
  const labelBox = label.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();

  expect(style.fontSize).toBe(LABEL_SIZE);
  expect(style.lineHeight).toBe(LABEL_LINE);
  expect(style.letterSpacing).toBe(LABEL_TRACKING);
  expect(
    Math.abs(labelBox.top + labelBox.height / 2 - boxRect.top),
  ).toBeLessThanOrEqual(1);
  expect(labelBox.left - boxRect.left).toBeGreaterThanOrEqual(LABEL_INSET);
  expect(style.backgroundColor).toBe(
    resolvedColour("--color-background", "backgroundColor"),
  );
});

test("insets the control 16px from the outline with no outline of its own", async () => {
  const { box, control } = await drawField();
  const style = getComputedStyle(control);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.paddingLeft).toBe(`${String(CONTROL_INLINE_PADDING)}px`);
  expect(control.getBoundingClientRect().height).toBe(
    box.getBoundingClientRect().height - 2,
  );
});

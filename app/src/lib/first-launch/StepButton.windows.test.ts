import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import StepButton from "./StepButton.svelte";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const GREEN_ACCENT = "rgb(47, 111, 79)";
const SETUP_BUTTON_WIDTH = 120;

const label = createRawSnippet(() => ({ render: () => "<span>Next</span>" }));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

async function renderButtonOnWindows(kind: "primary" | "quiet") {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  const screen = await render(StepButton, {
    kind,
    onclick: () => undefined,
    children: label,
  });
  return getComputedStyle(screen.getByRole("button").element());
}

test("fills the primary step button with the kit's accent at least 120px wide", async () => {
  const style = await renderButtonOnWindows("primary");

  expect(style.backgroundColor).toBe(GREEN_ACCENT);
  expect(parseFloat(style.minWidth)).toBe(SETUP_BUTTON_WIDTH);
  expect(style.borderRadius).toBe("4px");
});

test("draws the quiet step button as a standard outlined button", async () => {
  const style = await renderButtonOnWindows("quiet");

  expect(style.borderTopWidth).toBe("1px");
  expect(style.backgroundColor).not.toBe(GREEN_ACCENT);
  expect(parseFloat(style.minWidth)).toBe(SETUP_BUTTON_WIDTH);
});

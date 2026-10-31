import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import {
  contrastRatio,
  drawnContrast,
} from "../../../tests/components/contrast-ratio.ts";

import LibraryHeaderHarness from "./LibraryHeaderHarness.svelte";

const DESKTOP = { width: 1280, height: 800 };
const COMMAND_BUTTON = { width: 68, height: 64 };
const COMMAND_LABEL_SIZE = "12px";
const TITLE = { size: "28px", leading: "36px", weight: "600" };
const TEXT_CONTRAST = 4.5;
const PAGE_MARGIN = 24;
const RULE = 1;
const LINUX_CONTROL_HEIGHT = 36;

async function drawHeader(platform: Platform, theme: "light" | "dark") {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(LibraryHeaderHarness, { platform });
}

function button(name: string): HTMLElement {
  const element = page.getByRole("button", { name }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the ${name} button drew no element`);
  }
  return element;
}

function contrastOnThePage(inkProperty: string): number {
  const probe = document.createElement("div");
  probe.style.backgroundColor = "var(--background)";
  probe.style.color = `var(${inkProperty})`;
  document.body.append(probe);
  return drawnContrast(probe);
}

function partOf(element: Element, selector: string): Element {
  const part = element.querySelector(selector);
  if (part === null) {
    throw new Error(`no ${selector} inside the button`);
  }
  return part;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

for (const theme of ["light", "dark"] as const) {
  test(`draws Filter and View as 68 by 64 command bar buttons in the ${theme} theme`, async () => {
    await drawHeader("windows", theme);

    for (const name of ["Sort and filter", "View options"]) {
      const box = button(name).getBoundingClientRect();
      expect(box.width).toBe(COMMAND_BUTTON.width);
      expect(box.height).toBe(COMMAND_BUTTON.height);
    }
  });
}

test("puts each command's label under its icon in 12 pixel text", async () => {
  await drawHeader("windows", "light");

  for (const [name, label] of [
    ["Sort and filter", "Filter"],
    ["View options", "View"],
  ] as const) {
    const command = button(name);
    const icon = partOf(command, "svg").getBoundingClientRect();
    const words = page.getByText(label, { exact: true }).element();
    expect(command.contains(words)).toBe(true);
    expect(words.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      icon.bottom,
    );
    expect(getComputedStyle(words).fontSize).toBe(COMMAND_LABEL_SIZE);
  }
});

test("sets the page title as a 28 over 36 semibold Title", async () => {
  await drawHeader("windows", "light");

  const title = getComputedStyle(
    page.getByRole("heading", { name: "Library" }).element(),
  );

  expect(title.fontSize).toBe(TITLE.size);
  expect(title.lineHeight).toBe(TITLE.leading);
  expect(title.fontWeight).toBe(TITLE.weight);
});

test("holds the title and the command bar in a bar as tall as a command button and its rule", async () => {
  await drawHeader("windows", "light");

  const bar = document.querySelector("[data-page-toolbar]");

  expect(bar?.getBoundingClientRect().height).toBe(
    COMMAND_BUTTON.height + RULE,
  );
});

test("keeps a 24 pixel margin beside the page", async () => {
  await drawHeader("windows", "light");

  expect(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--spacing-gutter",
    ),
  ).toBe(`${String(PAGE_MARGIN / 16)}rem`);
});

test("leaves the other platforms' header controls at their own size", async () => {
  await drawHeader("linux", "light");

  expect(button("Sort and filter").getBoundingClientRect().width).not.toBe(
    COMMAND_BUTTON.width,
  );
  expect(button("Sort and filter").getBoundingClientRect().height).toBe(
    LINUX_CONTROL_HEIGHT,
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`reads the title and the command labels at 4.5 to 1 on the page in the ${theme} theme`, async () => {
    await drawHeader("windows", theme);

    expect(
      contrastOnThePage("--native-color-on-top-bar"),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  test(`reads an open command's label at 4.5 to 1 on the accent in the ${theme} theme`, async () => {
    await drawHeader("windows", theme);

    expect(
      contrastRatio("on-button-primary", "button-primary"),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
}

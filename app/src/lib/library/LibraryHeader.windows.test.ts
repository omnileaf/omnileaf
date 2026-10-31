import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio.ts";
import { resolvedColour } from "../../../tests/components/resolved-colour.ts";
import {
  COMMAND_BUTTON,
  TITLE_TYPE,
} from "../../../tests/components/windows-metrics.ts";

import LibraryHeaderHarness from "./LibraryHeaderHarness.svelte";

const DESKTOP = { width: 1280, height: 800 };
const COMMAND_LABEL_SIZE = "12px";
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

function drawnOver(ground: string, ink: string): number {
  const probe = document.createElement("div");
  probe.style.backgroundColor = ground;
  probe.style.color = ink;
  document.body.append(probe);
  return drawnContrast(probe);
}

function inkOnTheBar(element: Element): number {
  const bar = document.querySelector("[data-page-toolbar]");
  if (bar === null) {
    throw new Error("the header drew no bar");
  }
  return drawnOver(
    getComputedStyle(bar).backgroundColor,
    getComputedStyle(element).color,
  );
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

  expect(title.fontSize).toBe(TITLE_TYPE.size);
  expect(title.lineHeight).toBe(TITLE_TYPE.leading);
  expect(title.fontWeight).toBe(TITLE_TYPE.weight);
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
  test(`reads the drawn title and command labels at 4.5 to 1 on the bar in the ${theme} theme`, async () => {
    await drawHeader("windows", theme);
    const drawn = [
      page.getByRole("heading", { name: "Library" }).element(),
      page.getByText("Filter", { exact: true }).element(),
      page.getByText("View", { exact: true }).element(),
    ];

    for (const element of drawn) {
      expect(inkOnTheBar(element)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    }
  });

  test(`reads an open command's drawn label at 4.5 to 1 on its accent fill in the ${theme} theme`, async () => {
    await drawHeader("windows", theme);
    await page.getByRole("button", { name: "View options" }).click();

    const open = button("View options");
    const ink = resolvedColour("--native-color-on-button-primary", "color");
    const fill = resolvedColour(
      "--native-color-button-primary",
      "backgroundColor",
    );
    await vi.waitFor(() => {
      expect(getComputedStyle(open, "::before").backgroundColor).toBe(fill);
      expect(getComputedStyle(open).color).toBe(ink);
    });

    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(
      drawnOver(fill, getComputedStyle(open).color),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
}

import type { ComponentProps } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastOver } from "../../../tests/components/contrast-ratio.ts";
import { resolvedColour } from "../../../tests/components/resolved-colour.ts";
import { screenshotModeTurned } from "../../../tests/components/screenshot-mode.ts";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import AppNavigation from "./AppNavigation.svelte";

const WINDOW_HEIGHT = 800;
const LEAST_TEXT_CONTRAST = 4.5;
const LEAST_GRAPHIC_CONTRAST = 3;
const PANE_GROUND = "--windows-mica";
const KIT_FILLS = {
  light: { hover: "rgba(0, 0, 0, 0.035)", selected: "rgba(0, 0, 0, 0.035)" },
  dark: {
    hover: "rgba(255, 255, 255, 0.06)",
    selected: "rgba(255, 255, 255, 0.06)",
  },
} as const;

type Theme = keyof typeof KIT_FILLS;
const OPEN_PANE_WIDTHS = [1280, 1008];
const COMPACT_PANE_WIDTHS = [1007, 840, 700];

const NavigationWithAppContext = WithAppContext<
  ComponentProps<typeof AppNavigation>
>;

async function renderOnWindowsAt(width: number): Promise<void> {
  await renderAt(width, "windows");
}

async function renderAt(
  width: number,
  platform: Platform,
  theme: Theme = "light",
): Promise<void> {
  await page.viewport(width, WINDOW_HEIGHT);
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(NavigationWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: AppNavigation,
    pageProps: { current: "library" },
  });
}

function asElement(element: Element | null | undefined): Element {
  if (element === null || element === undefined) {
    throw new Error("the navigation pane drew no element");
  }
  return element;
}

function pane(): DOMRect {
  return asElement(
    page.getByRole("navigation", { name: "Main" }).element(),
  ).getBoundingClientRect();
}

function item(name: string): Element {
  return asElement(page.getByRole("link", { name }).element());
}

function boxOf(name: string): DOMRect {
  return item(name).getBoundingClientRect();
}

function rounded(box: DOMRect) {
  return {
    start: Math.round(box.left),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

for (const width of OPEN_PANE_WIDTHS) {
  test(`opens Windows' pane 320 wide with 36 tall items inset 4 and 4 apart in a ${String(width)} wide window`, async () => {
    await renderOnWindowsAt(width);

    const library = boxOf("Library");
    const browse = boxOf("Browse");

    expect(Math.round(pane().width)).toBe(320);
    expect(rounded(library)).toEqual({ start: 4, width: 312, height: 36 });
    expect(Math.round(browse.top - library.bottom)).toBe(4);
  });
}

for (const width of COMPACT_PANE_WIDTHS) {
  test(`folds Windows' pane to 48 of icons with 40 wide items in a ${String(width)} wide window`, async () => {
    await renderOnWindowsAt(width);

    const icon = asElement(item("History").querySelector("svg"));
    const iconBox = icon.getBoundingClientRect();

    expect(Math.round(pane().width)).toBe(48);
    expect(rounded(boxOf("History"))).toEqual({
      start: 4,
      width: 40,
      height: 36,
    });
    expect(Math.round(iconBox.left + iconBox.width / 2)).toBe(24);
  });
}

test("draws Windows' navigation icons 16 square", async () => {
  await renderOnWindowsAt(1280);

  const icon = asElement(item("Settings").querySelector("svg"));

  expect(rounded(icon.getBoundingClientRect())).toMatchObject({
    width: 16,
    height: 16,
  });
});

test("marks the current item with a 3 by 16 accent pill on its leading edge", async () => {
  await renderOnWindowsAt(1280);

  const pill = getComputedStyle(item("Library"), "::before");

  expect({
    width: pill.inlineSize,
    height: pill.blockSize,
    start: pill.insetInlineStart,
    colour: pill.backgroundColor,
  }).toEqual({
    width: "3px",
    height: "16px",
    start: "0px",
    colour: resolvedColour("--color-accent", "backgroundColor"),
  });
  expect(item("Library")).toHaveAttribute("aria-current", "page");
});

function paneToggle(name = "Hide the sidebar"): HTMLElement {
  const toggle = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name })
    .element();
  if (!(toggle instanceof HTMLElement)) {
    throw new Error("the navigation pane drew no toggle");
  }
  return toggle;
}

for (const width of [1280, 1007]) {
  test(`keeps the pane toggle's 40 tall row at the top of Windows' pane in a ${String(width)} wide window`, async () => {
    await renderOnWindowsAt(width);

    const toggle = asElement(
      document.querySelector('[aria-keyshortcuts="Control+B"]'),
    ).getBoundingClientRect();
    const firstItem = boxOf("Library");
    const paneTop = pane().top;

    expect({
      start: Math.round(toggle.left),
      top: Math.round(toggle.top - paneTop),
      width: Math.round(toggle.width),
      height: Math.round(toggle.height),
    }).toEqual({ start: 4, top: 2, width: 40, height: 36 });
    expect(firstItem.top - paneTop).toBeGreaterThanOrEqual(40);
  });
}

test("folds Windows' pane from its toggle and opens it again", async () => {
  await renderOnWindowsAt(1280);

  await userEvent.click(paneToggle());
  const folded = Math.round(pane().width);
  await userEvent.click(paneToggle("Show the sidebar"));

  expect({ folded, open: Math.round(pane().width) }).toEqual({
    folded: 48,
    open: 320,
  });
});

test("names the pane toggle's Ctrl+B shortcut in its tooltip and to assistive technology", async () => {
  await renderOnWindowsAt(1280);

  await userEvent.hover(paneToggle());

  expect(paneToggle()).toHaveAttribute("aria-keyshortcuts", "Control+B");
  await expect
    .poll(() => document.querySelector("[data-tooltip-content]")?.textContent)
    .toMatch(/Hide the sidebar\s*Ctrl\+B/);
});

function focusedName(): string | null | undefined {
  return document.activeElement?.textContent.trim();
}

test("moves between Windows' pane items with the arrow keys, stopping at either end", async () => {
  await renderOnWindowsAt(1280);
  (item("Library") as HTMLElement).focus();

  const visited: (string | null | undefined)[] = [];
  for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]) {
    await userEvent.keyboard(`{${key}}`);
    visited.push(focusedName());
  }
  await userEvent.keyboard("{ArrowUp}");

  expect(visited).toEqual(["Browse", "History", "Settings", "Settings"]);
  expect(focusedName()).toBe("History");
});

test("jumps to the first and last of Windows' pane items with Home and End", async () => {
  await renderOnWindowsAt(1280);
  (item("Browse") as HTMLElement).focus();

  await userEvent.keyboard("{End}");
  const last = focusedName();
  await userEvent.keyboard("{Home}");

  expect({ last, first: focusedName() }).toEqual({
    last: "Settings",
    first: "Library",
  });
});

test("leaves the arrow keys to the page on other desktops", async () => {
  await renderAt(1280, "linux");
  (item("Library") as HTMLElement).focus();

  await userEvent.keyboard("{ArrowDown}");

  expect(focusedName()).toBe("Library");
});

for (const theme of ["light", "dark"] as const) {
  test(`fills Windows' current and hovered items with the kit's subtle fill in the ${theme} theme`, async () => {
    await renderAt(1280, "windows", theme);

    await userEvent.hover(item("Browse"));

    await expect
      .poll(() => ({
        selected: getComputedStyle(item("Library")).backgroundColor,
        hover: getComputedStyle(item("Browse")).backgroundColor,
      }))
      .toEqual(KIT_FILLS[theme]);
  });

  test(`keeps Windows' pane text at 4.5:1 and its pill and focus ring at 3:1 in the ${theme} theme`, async () => {
    await renderAt(1280, "windows", theme);
    const selected = [PANE_GROUND, "nav-item-selected"];

    const ratios = [
      ["text", contrastOver("on-nav-item", selected), LEAST_TEXT_CONTRAST],
      ["pill", contrastOver("nav-indicator", selected), LEAST_GRAPHIC_CONTRAST],
      [
        "ring",
        contrastOver("focus-ring", [PANE_GROUND]),
        LEAST_GRAPHIC_CONTRAST,
      ],
      [
        "ring on the current item",
        contrastOver("focus-ring", selected),
        LEAST_GRAPHIC_CONTRAST,
      ],
    ] as const;

    expect(ratios.filter(([, ratio, least]) => ratio < least)).toEqual([]);
  });
}

test("rings a keyboard-focused item in Windows' two-tone focus ring", async () => {
  await renderOnWindowsAt(1280);

  (item("Browse") as HTMLElement).focus({ focusVisible: true });
  const style = getComputedStyle(item("Browse"));

  expect({
    outline: style.outlineColor,
    width: style.outlineWidth,
    inner: style.boxShadow.includes(
      resolvedColour("--native-color-focus-ring-inner", "color"),
    ),
  }).toEqual({
    outline: resolvedColour("--native-color-focus-ring", "outlineColor"),
    width: "2px",
    inner: true,
  });
});

test("rings a keyboard-focused pane toggle in Windows' two-tone focus ring", async () => {
  await renderOnWindowsAt(1280);

  paneToggle().focus({ focusVisible: true });
  const style = getComputedStyle(paneToggle());

  expect({
    outline: style.outlineColor,
    width: style.outlineWidth,
  }).toEqual({
    outline: resolvedColour("--native-color-focus-ring", "outlineColor"),
    width: "2px",
  });
});

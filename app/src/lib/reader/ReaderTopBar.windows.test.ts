import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastOverLayers } from "../../../tests/components/composited-contrast";
import { resolvedColour } from "../../../tests/components/resolved-colour";

import ReaderPanelHarness from "./ReaderPanelHarness.svelte";
import ReaderTopBarHarness from "./ReaderTopBarHarness.svelte";

const DESKTOP = { width: 1280, height: 800 };
const COMMAND_LABELS = ["Shortcuts", "Bookmark", "Settings", "Full screen"];
const QUICK_SETTINGS = ["Two pages", "Fit height", "Light"];
const DIRECTION = /^Left to right/;
const BACKINGS = ["#000000", "#ffffff"] as const;
const THEMES = ["light", "dark"] as const;
const TEXT_CONTRAST = 4.5;
const NON_TEXT_CONTRAST = 3;
const VISIBLE_PX = 1;

async function openReader(
  platform: Platform,
  theme: "light" | "dark" = "light",
  size: { width: number; height: number } = DESKTOP,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await page.viewport(size.width, size.height);
  await render(ReaderTopBarHarness, { platform });
}

function boxOf(name: string): DOMRect {
  return page
    .getByRole("button", { name, exact: true })
    .element()
    .getBoundingClientRect();
}

function quickSetting(name: string): HTMLElement {
  const element = page.getByRole("button", { name, exact: true }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`${name} drew no element`);
  }
  return element;
}

function bar(): HTMLElement {
  const element = page.getByRole("main").element().firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("the reader drew no bar");
  }
  return element;
}

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws the reader's primary actions as 68 wide command bar buttons 64 tall", async () => {
  await openReader("windows");

  for (const [name, label] of [
    ["Keyboard shortcuts", "Shortcuts"],
    ["Bookmark this page", "Bookmark"],
    ["Reading settings", "Settings"],
    ["Full screen", "Full screen"],
  ]) {
    const box = boxOf(name ?? "");

    expect({ label, width: box.width, height: box.height }).toEqual({
      label,
      width: 68,
      height: 64,
    });
  }
});

test("shows each command's label under its 20 wide icon", async () => {
  await openReader("windows");

  for (const label of COMMAND_LABELS) {
    const text = page.getByText(label, { exact: true }).element();
    const button = text.closest("button");
    const icon = button?.querySelector("svg")?.getBoundingClientRect();

    expect(icon?.width, label).toBe(20);
    expect(icon?.bottom ?? Infinity, label).toBeLessThanOrEqual(
      text.getBoundingClientRect().top,
    );
  }
});

test("keeps More an icon on its own, 48 wide", async () => {
  await openReader("windows");

  expect(boxOf("More").width).toBe(48);
  expect(page.getByText("More", { exact: true }).query()).toBeNull();
});

test("sits the bar on the flyout acrylic over the page with a blur behind it", async () => {
  await openReader("windows");
  const style = getComputedStyle(bar());

  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-menu", "backgroundColor"),
  );
  expect(style.backdropFilter).toBe("blur(30px)");
  expect(style.borderBottomColor).toBe(
    resolvedColour("--native-color-menu-edge", "color"),
  );
});

test("sits the bar on the dark acrylic in the dark chrome", async () => {
  await openReader("windows", "dark");

  expect(getComputedStyle(bar()).backgroundColor).toBe(
    "rgba(44, 44, 44, 0.96)",
  );
});

test("draws the quick settings as 68 wide labelled command buttons in the bar", async () => {
  await openReader("windows");

  for (const name of QUICK_SETTINGS) {
    const box = quickSetting(name).getBoundingClientRect();

    expect({ name, width: box.width, height: box.height }).toEqual({
      name,
      width: 68,
      height: 64,
    });
  }
});

test("draws the direction command the size of the others with its words whole", async () => {
  await openReader("windows");
  const direction = page.getByRole("button", { name: DIRECTION }).element();
  const box = direction.getBoundingClientRect();
  const words = [...direction.querySelectorAll("span")].filter(
    (span) => span.textContent === "Left to right" && span.clientWidth > 0,
  );

  expect([box.width, box.height]).toEqual([68, 64]);
  expect(words.every((span) => span.scrollWidth <= span.clientWidth)).toBe(
    true,
  );
  expect(words.length).toBeGreaterThan(0);
});

async function readRightToLeft(): Promise<HTMLElement> {
  await page.getByRole("button", { name: DIRECTION }).click();
  await page.getByRole("menuitemradio", { name: "Right to left" }).click();
  await userEvent.unhover(page.getByRole("button", { name: /^Right to left/ }));
  const direction = page
    .getByRole("button", { name: /^Right to left/ })
    .element();
  if (!(direction instanceof HTMLElement)) {
    throw new Error("the direction command drew no element");
  }
  return direction;
}

for (const theme of THEMES) {
  test(`fills the direction command with the accent while it reads right to left in the ${theme} chrome`, async () => {
    await openReader("windows", theme);
    const direction = await readRightToLeft();

    await expect
      .poll(() => getComputedStyle(direction, "::before").backgroundColor)
      .toBe(resolvedColour("--native-color-button-primary", "backgroundColor"));
  });

  test(`keeps the lit direction command readable under the pointer in the ${theme} chrome`, async () => {
    await openReader("windows", theme);
    const direction = await readRightToLeft();

    await userEvent.hover(direction);

    await expect
      .poll(() => getComputedStyle(direction, "::before").backgroundColor)
      .toBe(
        resolvedColour(
          "--native-color-button-primary-hover",
          "backgroundColor",
        ),
      );
    expect(getComputedStyle(direction).color).toBe(
      resolvedColour("--native-color-on-button-primary", "color"),
    );
  });
}

test("takes the direction command's words out of a 48 wide button in a narrow window", async () => {
  document.body.replaceChildren();
  followCorePlatform("windows");
  document.documentElement.dataset.theme = "light";
  await page.viewport(500, 800);
  await render(ReaderPanelHarness, { platform: "windows", controls: "dark" });
  const direction = page.getByRole("button", { name: DIRECTION }).element();
  const shown = [...direction.querySelectorAll("span")].filter(
    (span) => span.clientWidth > 1 && span.textContent.trim() !== "",
  );

  expect(shown).toEqual([]);
  expect(direction.getBoundingClientRect().width).toBe(48);
});

test("fills Shortcuts with the subtle layer while its dialog is open", async () => {
  await openReader("windows");
  const shortcuts = quickSetting("Keyboard shortcuts");

  await userEvent.unhover(shortcuts);
  expect(getComputedStyle(shortcuts, "::before").backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
  await userEvent.click(shortcuts);
  await userEvent.unhover(shortcuts);

  await expect
    .poll(() => getComputedStyle(shortcuts, "::before").backgroundColor)
    .toBe(
      resolvedColour("--native-color-button-plain-hover", "backgroundColor"),
    );
});

test("leaves the room a focus ring needs above the bar's tallest buttons", async () => {
  await openReader("windows");
  const settings = page
    .getByRole("button", { name: "Reading settings" })
    .element();

  for (let tabs = 0; document.activeElement !== settings && tabs < 20; tabs++) {
    await userEvent.tab();
  }
  const ring = getComputedStyle(settings);
  const ringReach =
    Number.parseFloat(ring.outlineWidth) +
    Number.parseFloat(ring.outlineOffset);

  expect(document.activeElement).toBe(settings);
  expect(settings.getBoundingClientRect().height).toBe(64);
  expect(
    settings.getBoundingClientRect().top - ringReach,
  ).toBeGreaterThanOrEqual(0);
});

test("keeps the AUTO mark out of the command's room", async () => {
  await openReader("windows");
  const mark = page.getByText("AUTO", { exact: true }).element();

  expect(mark.getBoundingClientRect().height).toBeLessThanOrEqual(1);
});

test("takes the raised segment frame off the quick settings", async () => {
  await openReader("windows");
  const group = page.getByRole("group", { name: "Quick settings" }).element();

  expect(getComputedStyle(group).boxShadow).toBe("none");
  expect(getComputedStyle(quickSetting("Two pages")).borderTopWidth).toBe(
    "0px",
  );
});

test("fills a switched on quick setting with the accent under its words", async () => {
  await openReader("windows");
  const twoPages = quickSetting("Two pages");

  await page.getByRole("button", { name: "Two pages" }).click();
  await userEvent.unhover(page.getByRole("button", { name: "Two pages" }));

  await expect
    .poll(() => getComputedStyle(twoPages, "::before").backgroundColor)
    .toBe(resolvedColour("--native-color-button-primary", "backgroundColor"));
  await expect
    .poll(() => getComputedStyle(twoPages).color)
    .toBe(resolvedColour("--native-color-on-button-primary", "color"));
});

test("leaves a quick setting that is off on the bar with no fill", async () => {
  await openReader("windows");

  expect(
    getComputedStyle(quickSetting("Two pages"), "::before").backgroundColor,
  ).toBe("rgba(0, 0, 0, 0)");
});

function tooltipText(): string | undefined {
  return document
    .querySelector("[data-tooltip-content]")
    ?.textContent.replaceAll(/\s+/g, " ")
    .trim();
}

test("names Full screen's key in its tooltip and for screen readers", async () => {
  await openReader("windows");
  const button = page.getByRole("button", { name: "Full screen" });

  await userEvent.hover(button);

  await expect.poll(() => tooltipText()).toBe("Full screen F");
  expect(button.element().getAttribute("aria-keyshortcuts")).toBe("F");
});

test("names the shortcuts key in its tooltip and the back way in Back's", async () => {
  await openReader("windows");

  await userEvent.hover(
    page.getByRole("button", { name: "Keyboard shortcuts" }),
  );
  await expect.poll(() => tooltipText()).toBe("Keyboard shortcuts ?");
  await userEvent.unhover(
    page.getByRole("button", { name: "Keyboard shortcuts" }),
  );

  const back = page.getByRole("link", { name: /^Back/ });
  await userEvent.hover(back);
  await expect.poll(() => tooltipText()).toContain("Esc");
  expect(back.element().getAttribute("aria-keyshortcuts")).toBe(
    "Escape Alt+ArrowLeft",
  );
});

test("leaves Full screen's key off the other desktops' bar", async () => {
  await openReader("linux");

  expect(
    page
      .getByRole("button", { name: "Full screen" })
      .element()
      .getAttribute("aria-keyshortcuts"),
  ).toBeNull();
});

function wordsIn(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("*")].filter((element) => {
    const hasWords = [...element.childNodes].some(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        (node.textContent ?? "").trim() !== "",
    );
    const box = element.getBoundingClientRect();
    return (
      hasWords &&
      box.width > VISIBLE_PX &&
      box.height > VISIBLE_PX &&
      getComputedStyle(element).visibility === "visible" &&
      element.closest("[aria-disabled=true]") === null
    );
  });
}

function barGround(): string {
  return getComputedStyle(bar()).backgroundColor;
}

for (const theme of THEMES) {
  for (const backing of BACKINGS) {
    test(`reads every word of the bar at 4.5 to 1 in the ${theme} chrome over a ${backing} page`, async () => {
      await openReader("windows", theme);
      const words = wordsIn(bar());

      expect(words.length).toBeGreaterThan(0);
      for (const word of words) {
        expect(
          contrastOverLayers(
            getComputedStyle(word).color,
            [barGround()],
            backing,
          ),
          word.textContent,
        ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    });

    test(`draws every icon of the bar at 3 to 1 in the ${theme} chrome over a ${backing} page`, async () => {
      await openReader("windows", theme);
      const icons = [...bar().querySelectorAll("svg")];

      expect(icons.length).toBeGreaterThan(0);
      for (const icon of icons) {
        expect(
          contrastOverLayers(
            getComputedStyle(icon).color,
            [barGround()],
            backing,
          ),
          icon.parentElement?.getAttribute("aria-label") ?? "an icon",
        ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      }
    });

    test(`draws a switched on command's fill at 3 to 1 and its words at 4.5 to 1 in the ${theme} chrome over a ${backing} page`, async () => {
      await openReader("windows", theme);
      const twoPages = quickSetting("Two pages");

      await page.getByRole("button", { name: "Two pages" }).click();
      await userEvent.unhover(page.getByRole("button", { name: "Two pages" }));
      await expect
        .poll(() => getComputedStyle(twoPages, "::before").backgroundColor)
        .toBe(
          resolvedColour("--native-color-button-primary", "backgroundColor"),
        );
      const fill = getComputedStyle(twoPages, "::before").backgroundColor;
      const words = wordsIn(twoPages)[0];

      expect(
        contrastOverLayers(fill, [barGround()], backing),
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      expect(
        contrastOverLayers(
          getComputedStyle(words ?? twoPages).color,
          [barGround(), fill],
          backing,
        ),
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    });

    test(`rings a focused command at 3 to 1 in the ${theme} chrome over a ${backing} page`, async () => {
      await openReader("windows", theme);

      await userEvent.tab();
      const focused = document.activeElement;
      const ring = getComputedStyle(focused ?? bar());

      expect(ring.outlineStyle).toBe("solid");
      expect(
        contrastOverLayers(ring.outlineColor, [barGround()], backing),
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    });
  }
}

for (const platform of ["linux", "macos", "ios", "android"] as const) {
  test(`draws no command labels on ${platform}`, async () => {
    await openReader(platform);

    for (const label of COMMAND_LABELS) {
      expect(page.getByText(label, { exact: true }).query(), label).toBeNull();
    }
  });
}

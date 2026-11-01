import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { DEFAULT_LIBRARY_VIEW, type Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ViewOptions from "./ViewOptions.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const LARGE_DETENT = 0.92;
const MORE_BUTTON = { right: 20, top: 24, size: 44 };

function addMoreButton(): HTMLButtonElement {
  const more = document.createElement("button");
  more.setAttribute("aria-label", "More for the library");
  Object.assign(more.style, {
    position: "fixed",
    top: `${String(MORE_BUTTON.top)}px`,
    right: `${String(MORE_BUTTON.right)}px`,
    width: `${String(MORE_BUTTON.size)}px`,
    height: `${String(MORE_BUTTON.size)}px`,
  });
  document.body.append(more);
  return more;
}

async function openOn(platform: Platform, size = PHONE) {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await page.viewport(size.width, size.height);
  const returnFocusTo = size === PHONE ? null : addMoreButton();
  await render(ViewOptions, {
    view: DEFAULT_LIBRARY_VIEW,
    coversDrawn: 3,
    mostThatFit: 3,
    hasCategories: true,
    onChoose: () => undefined,
    isOpen: true,
    showsButton: false,
    returnFocusTo,
  });
}

function boxOf(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

function groupAfter(heading: string): HTMLElement {
  const title = page.getByRole("heading", { name: heading, exact: true });
  const group = title.element().nextElementSibling;
  if (!(group instanceof HTMLElement)) {
    throw new Error(`no group follows ${heading}`);
  }
  return group;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.contrast;
  delete document.documentElement.dataset.transparency;
  document.body.replaceChildren();
});

test("raises View options to the large detent on a grouped ground on an iPhone", async () => {
  await openOn("ios");

  const sheet = page.getByRole("dialog").element();

  expect(Math.round(boxOf(sheet).height)).toBe(
    Math.round(PHONE.height * LARGE_DETENT),
  );
  expect(sheet.getAttribute("data-ground")).toBe("grouped");
  expect(getComputedStyle(sheet).backgroundColor).toBe("rgb(242, 242, 247)");
});

test("puts a Close circle beside a centred title, without a Done button, on an iPhone", async () => {
  await openOn("ios");

  const close = boxOf(page.getByRole("button", { name: "Close" }).element());
  const title = boxOf(
    page.getByRole("heading", { name: "View options" }).element(),
  );

  expect(close.right).toBeLessThanOrEqual(title.left);
  expect(Math.abs(title.left + title.width / 2 - PHONE.width / 2)).toBeLessThan(
    1,
  );
  expect(close.width).toBe(close.height);
  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
});

test("draws Layout, the library page and the covers as inset groups on an iPhone", async () => {
  await openOn("ios");

  const sheetBox = boxOf(page.getByRole("dialog").element());

  for (const heading of ["Layout", "On the library page", "Show on covers"]) {
    const title = page.getByRole("heading", { name: heading, exact: true });
    const titleStyle = getComputedStyle(title.element());
    const group = groupAfter(heading);
    const box = boxOf(group);
    const style = getComputedStyle(group);

    expect(
      boxOf(title.element()).left +
        parseFloat(titleStyle.paddingLeft) -
        sheetBox.left,
    ).toBe(32);
    expect(titleStyle.fontWeight).toBe("590");
    expect(box.left - sheetBox.left).toBe(16);
    expect(sheetBox.right - box.right).toBe(16);
    expect(style.borderRadius).toBe("26px");
    expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
  }
});

test("stacks a row's label over its control in the Layout group on an iPhone", async () => {
  await openOn("ios");

  const label = boxOf(
    page.getByText("Covers per row", { exact: true }).element(),
  );
  const control = boxOf(
    page.getByRole("radiogroup", { name: "Covers per row" }).element(),
  );

  expect(control.top).toBeGreaterThanOrEqual(label.bottom);
});

test("draws the Android phone's sheet with no Done or Close button, left by its handle or scrim", async () => {
  await openOn("android");

  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Close" }))
    .not.toBeInTheDocument();
  expect(
    page.getByRole("dialog").element().getAttribute("data-ground"),
  ).toBeNull();
});

test("draws the Display choices as labels alone in one row on an iPhone", async () => {
  await openOn("ios");

  const display = page.getByRole("radiogroup", { name: "Display" }).element();
  const tops = [...display.querySelectorAll("[role=radio]")].map(
    (segment) => segment.getBoundingClientRect().top,
  );

  expect(display.querySelectorAll("svg")).toHaveLength(0);
  expect(new Set(tops).size).toBe(1);
});

test("opens View options on an iPad as a popover under the More button, lined up with its right edge", async () => {
  await openOn("ios", TABLET);

  const popover = page.getByRole("dialog").element();
  const more = boxOf(
    page.getByRole("button", { name: "More for the library" }).element(),
  );

  expect(boxOf(popover).width).toBe(360);
  await expect.poll(() => Math.round(boxOf(popover).right)).toBe(more.right);
  await expect
    .poll(() => Math.round(boxOf(popover).top))
    .toBeGreaterThanOrEqual(more.bottom);
});

test("draws the iPad's View options popover on a 38 radius glass fill with a deep shadow and no edge", async () => {
  await openOn("ios", TABLET);

  const style = getComputedStyle(page.getByRole("dialog").element());

  expect(style.borderRadius).toBe("38px");
  expect(style.borderTopWidth).toBe("0px");
  expect(style.backgroundColor).toBe("rgba(255, 255, 255, 0.85)");
  expect(style.backdropFilter).toContain("blur(30px)");
  expect(style.backdropFilter).toContain("saturate(1.8)");
  expect(style.boxShadow).toContain("0px 8px 48px");
});

test("pads the iPad's View options popover 20 above and 6 below, with 16 beside its words", async () => {
  await openOn("ios", TABLET);

  const popover = page.getByRole("dialog").element();
  const style = getComputedStyle(popover);
  const title = page.getByRole("heading", { name: "View options" });

  expect([style.paddingTop, style.paddingBottom]).toEqual(["20px", "6px"]);
  expect([style.paddingLeft, style.paddingRight]).toEqual(["0px", "0px"]);
  expect(style.rowGap).toBe("14px");
  expect(
    boxOf(title.element()).left +
      parseFloat(getComputedStyle(title.element()).paddingLeft) -
      boxOf(popover).left,
  ).toBe(16);
});

test("sets the iPad popover's title as a 17 semibold headline and its sections as 13 footnotes", async () => {
  await openOn("ios", TABLET);

  const title = getComputedStyle(
    page.getByRole("heading", { name: "View options" }).element(),
  );
  const section = getComputedStyle(
    page.getByRole("heading", { name: "Layout", exact: true }).element(),
  );

  expect([title.fontSize, title.fontWeight]).toEqual(["17px", "600"]);
  expect([section.fontSize, section.fontWeight]).toEqual(["13px", "590"]);
});

test("keeps the iPad popover's switch rows inside it, padded 16 at their end", async () => {
  await openOn("ios", TABLET);

  const popover = boxOf(page.getByRole("dialog").element());
  const unread = page.getByRole("switch", { name: "Unread count" }).element();

  expect(boxOf(unread).right).toBeLessThanOrEqual(popover.right);
  expect(getComputedStyle(unread).paddingRight).toBe("16px");
});

const POPOVER_FILLS = [
  {
    mode: "light",
    theme: "light",
    fill: "rgba(255, 255, 255, 0.85)",
    blur: "blur(30px)",
  },
  {
    mode: "dark",
    theme: "dark",
    fill: "rgba(26, 26, 26, 0.8)",
    blur: "blur(30px)",
  },
  {
    mode: "light with Increase Contrast",
    theme: "light",
    contrast: "more",
    fill: "rgba(255, 255, 255, 0.94)",
    blur: "blur(30px)",
  },
  {
    mode: "dark with Increase Contrast",
    theme: "dark",
    contrast: "more",
    fill: "rgb(14, 14, 14)",
    blur: "blur(30px)",
  },
  {
    mode: "light with Reduce Transparency",
    theme: "light",
    transparency: "reduced",
    fill: "rgb(242, 242, 243)",
    blur: "blur(0px)",
  },
  {
    mode: "dark with Reduce Transparency",
    theme: "dark",
    transparency: "reduced",
    fill: "rgb(20, 20, 20)",
    blur: "blur(0px)",
  },
] as const;

for (const { mode, ...look } of POPOVER_FILLS) {
  test(`fills the iPad's View options popover for ${mode}`, async () => {
    await openOn("ios", TABLET);
    const root = document.documentElement;
    root.dataset.theme = look.theme;
    if ("contrast" in look) {
      root.dataset.contrast = look.contrast;
    }
    if ("transparency" in look) {
      root.dataset.transparency = look.transparency;
    }

    const style = getComputedStyle(page.getByRole("dialog").element());

    await expect.poll(() => style.backgroundColor).toBe(look.fill);
    expect(style.backdropFilter).toContain(look.blur);
  });
}

test("draws the iPad popover's choice labels as 15 regular subheads and its switch titles as 17 regular body", async () => {
  await openOn("ios", TABLET);

  const typeOf = (name: string) => {
    const style = getComputedStyle(
      page.getByText(name, { exact: true }).element(),
    );
    return [style.fontSize, style.fontWeight, style.letterSpacing];
  };

  for (const label of ["Display", "Covers per row", "Group by"]) {
    expect(typeOf(label)).toEqual(["15px", "400", "-0.23px"]);
  }
  expect(typeOf("Unread count")).toEqual(["17px", "400", "-0.43px"]);
});

test("keeps the page's switches under no heading of their own in the iPad popover", async () => {
  await openOn("ios", TABLET);

  const heading = page
    .getByRole("heading", { name: "On the library page" })
    .element();
  const section = heading.parentElement;
  const firstSwitch = page
    .getByRole("switch", { name: "Item counts" })
    .element();

  expect([boxOf(heading).width, boxOf(heading).height]).toEqual([1, 1]);
  expect(boxOf(firstSwitch).top).toBe(section?.getBoundingClientRect().top);
});

const OWN_RADIUS = {
  android: "12px",
  linux: "8px",
  macos: "10px",
  windows: "8px",
} as const;

for (const platform of ["android", "linux", "macos", "windows"] as const) {
  test(`keeps ${platform}'s View options popover on its own surface at a tablet's width`, async () => {
    await openOn(platform, TABLET);

    const popover = page.getByRole("dialog").element();
    const style = getComputedStyle(popover);
    const textOf = (element: Element) => {
      const type = getComputedStyle(element);
      return [type.fontSize, type.fontWeight, type.letterSpacing];
    };

    expect(style.borderRadius).toBe(OWN_RADIUS[platform]);
    expect(style.borderTopWidth).toBe("1px");
    expect(style.backdropFilter).not.toContain("saturate");
    expect(style.boxShadow).not.toContain("48px");
    expect([
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ]).toEqual(["16px", "18px", "18px", "18px"]);
    expect(style.rowGap).toBe("12px");
    expect(
      textOf(page.getByRole("heading", { name: "View options" }).element()),
    ).toEqual(["17px", "700", "normal"]);
    expect(
      textOf(
        page.getByRole("heading", { name: "Layout", exact: true }).element(),
      ),
    ).toEqual(["14px", "600", "normal"]);
    expect(
      textOf(page.getByText("Display", { exact: true }).element()),
    ).toEqual(["16px", "500", "normal"]);
  });
}

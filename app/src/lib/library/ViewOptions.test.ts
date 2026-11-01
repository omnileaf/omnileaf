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
  await expect.poll(() => Math.round(boxOf(popover).top)).toBe(more.bottom + 8);
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

for (const platform of ["android", "linux", "macos", "windows"] as const) {
  test(`keeps ${platform}'s View options popover on its own surface at a tablet's width`, async () => {
    await openOn(platform, TABLET);

    const style = getComputedStyle(page.getByRole("dialog").element());

    expect(style.borderRadius).not.toBe("38px");
    expect(style.borderTopWidth).toBe("1px");
    expect(style.backgroundColor).not.toBe("rgba(255, 255, 255, 0.85)");
  });
}

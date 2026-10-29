import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { DEFAULT_LIBRARY_VIEW, type Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ViewOptions from "./ViewOptions.svelte";

const PHONE = { width: 390, height: 844 };
const LARGE_DETENT = 0.92;

async function openOn(platform: Platform, size = PHONE) {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await page.viewport(size.width, size.height);
  await render(ViewOptions, {
    view: DEFAULT_LIBRARY_VIEW,
    coversDrawn: 3,
    mostThatFit: 3,
    hasCategories: true,
    onChoose: () => undefined,
    isOpen: true,
    showsButton: false,
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

test("keeps the Done sheet on an Android phone", async () => {
  await openOn("android");

  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .toBeInTheDocument();
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

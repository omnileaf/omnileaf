import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import FolderRow from "./FolderRow.svelte";

const PHONE = { width: 390, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;
const FOLDER = {
  kind: "linked",
  name: "Comics",
  location: "iCloud Drive/Comics",
  isAvailable: true,
} as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function rowOn(
  platform: "ios" | "android",
  size: { width: number; height: number },
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(FolderRow, { folder: FOLDER });
}

function asElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the folder row drew no such element");
  }
  return element;
}

function item(): HTMLElement {
  return asElement(document.querySelector("[data-slot=item]"));
}

function media(): HTMLElement {
  return asElement(document.querySelector("[data-slot=item-media]"));
}

test("sets a linked folder as a 16 point inset row with a bare accent glyph on an iPhone", async () => {
  await rowOn("ios", PHONE);

  const glyph = media().querySelector("svg");
  if (glyph === null) {
    throw new Error("the folder row drew no glyph");
  }
  const style = getComputedStyle(item());

  expect(style.paddingLeft).toBe("16px");
  expect(glyph.getBoundingClientRect().width).toBe(22);
  expect(getComputedStyle(media()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(media()).color).toBe(
    resolvedColour("--color-accent", "color"),
  );
  expect(
    asElement(
      item().querySelector("[data-slot=item-content]"),
    ).getBoundingClientRect().left - glyph.getBoundingClientRect().right,
  ).toBe(12);
});

test("sets the title in 17 point regular type and the place in 15 point on an iPhone", async () => {
  await rowOn("ios", PHONE);

  const title = getComputedStyle(
    asElement(item().querySelector("[data-slot=item-title]")),
  );
  const place = getComputedStyle(
    asElement(item().querySelector("[data-slot=item-description]")),
  );

  expect({
    titleSize: title.fontSize,
    titleWeight: title.fontWeight,
    placeSize: place.fontSize,
  }).toEqual({ titleSize: "17px", titleWeight: "400", placeSize: "15px" });
});

test("keeps the icon tile and the shorter row on an iPad", async () => {
  await rowOn("ios", TABLET);

  expect(getComputedStyle(media()).backgroundColor).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  expect(item().getBoundingClientRect().height).toBeLessThan(70);
});

test("sets a folder as a flush Android row with a bare 24px icon at x=16 and its title at x=56", async () => {
  await rowOn("android", PHONE);

  const row = item().getBoundingClientRect();
  const icon = asElement(item().querySelector("[data-icon=folder]"));
  const title = asElement(item().querySelector("[data-slot=item-title]"));
  const place = asElement(item().querySelector("[data-slot=item-description]"));

  expect(item().querySelector("[data-slot=item-media]")).toBeNull();
  expect(item().querySelector("svg")).toBeNull();
  expect(icon.getBoundingClientRect().left).toBeCloseTo(row.left + 16, 0);
  expect(icon.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(title.getBoundingClientRect().left).toBeCloseTo(row.left + 56, 0);
  expect({
    titleSize: getComputedStyle(title).fontSize,
    titleTracking: getComputedStyle(title).letterSpacing,
    titleWeight: getComputedStyle(title).fontWeight,
    placeSize: getComputedStyle(place).fontSize,
  }).toEqual({
    titleSize: "16px",
    titleTracking: "0.5px",
    titleWeight: "400",
    placeSize: "14px",
  });
});

test("leaves the iPhone folder row without a pressed or hover tint, since the row opens nothing", async () => {
  await rowOn("ios", PHONE);

  expect(item().className).not.toMatch(/(?:hover|active):bg-/);
  expect(item().className).not.toContain("data-picked:");
});

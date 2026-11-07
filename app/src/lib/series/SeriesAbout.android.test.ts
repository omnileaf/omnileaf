import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform, SeriesOverview } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesAbout from "./SeriesAbout.svelte";

const PHONE = { width: 400, height: 800 } as const;
const SERIES_ID =
  "0190a3e4-0000-8000-8000-0000000000a1" as SeriesOverview["id"];

const OVERVIEW: SeriesOverview = {
  id: SERIES_ID,
  title: "Sample Series 04",
  year: null,
  bookCount: 8,
  readCount: 2,
  bookmarkCount: 0,
  cover: null,
  folder: "Comics",
  upNext: null,
  format: "Manga",
  creators: [],
  summary:
    "A lighthouse keeper's apprentice spends the winter at the harbour gate writing letters to a sister who never answers, and slowly learns that the sea keeps its own post. ".repeat(
      3,
    ),
  tags: ["Slice of life", "Seinen"],
  related: [],
  secondsLeft: null,
  sections: [],
  missingVolumes: [],
  lastVolume: null,
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function heroOn(platform: Platform) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(SeriesAbout, {
    overview: OVERVIEW,
    details: undefined,
    cover: { kind: "none" },
    coverUrl: () => "",
    isWide: false,
    onMarkAll: () => Promise.resolve(),
    onEditDetails: undefined,
  });
  const cover = page.getByRole("img", { name: /^Cover of/ }).element();
  const title = page.getByRole("heading", { level: 1 }).element();
  const coverBox = cover.getBoundingClientRect();
  const titleBox = title.getBoundingClientRect();
  const type = getComputedStyle(title);
  return {
    coverWidth: coverBox.width,
    coverCorner: getComputedStyle(cover).borderTopLeftRadius,
    isBesideCover: titleBox.left >= coverBox.right,
    titleTopFromCover: titleBox.top - coverBox.top,
    title: [type.fontSize, type.lineHeight, type.fontWeight, type.textAlign],
  };
}

test("draws an Android phone's series hero as a cover with the title beside it", async () => {
  const drawn = await heroOn("android");

  expect(drawn).toEqual({
    coverWidth: 112,
    coverCorner: "4px",
    isBesideCover: true,
    titleTopFromCover: 4,
    title: ["24px", "32px", "400", "start"],
  });
});

test("keeps an iPhone's series hero a centred stack under the cover", async () => {
  const drawn = await heroOn("ios");

  expect(drawn.isBesideCover).toBe(false);
  expect(drawn.coverWidth).toBe(120);
  expect(drawn.title[3]).toBe("center");
});

async function summaryOn(platform: Platform) {
  await heroOn(platform);
  await expect
    .element(page.getByRole("button", { name: "More" }))
    .toBeVisible();
  const more = page.getByRole("button", { name: "More" }).element();
  const tag = page
    .getByRole("link", { name: "Seinen" })
    .element().firstElementChild;
  if (tag === null) {
    throw new Error("the tag drew no chip");
  }
  const describe = (element: Element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      height: box.height,
      corner: Number.parseFloat(style.borderTopLeftRadius),
      sides: style.paddingLeft,
      type: [style.fontSize, style.lineHeight, style.fontWeight],
      ink: style.color,
    };
  };
  return { more: describe(more), tag: describe(tag) };
}

test("draws an Android phone's More button as a 40px plain pill and its tags as 32px chips", async () => {
  const { more, tag } = await summaryOn("android");

  expect(more.height).toBe(40);
  expect(more.corner).toBeGreaterThanOrEqual(20);
  expect([more.type, more.ink]).toEqual([
    ["14px", "20px", "500"],
    "rgb(50, 106, 77)",
  ]);
  expect(tag).toMatchObject({
    height: 32,
    corner: 8,
    sides: "16px",
    type: ["14px", "20px", "500"],
    ink: "rgb(44, 53, 46)",
  });
});

test("keeps an iPhone's tags 22px chips", async () => {
  const { tag } = await summaryOn("ios");

  expect(tag.height).toBe(22);
});

async function detailsOn(platform: Platform) {
  await heroOn(platform);
  await page.getByRole("button", { name: "Details" }).click();
  const terms = [...document.querySelectorAll("dt")];
  const first = terms[0];
  const value = first?.nextElementSibling;
  if (first === undefined || value === null || value === undefined) {
    throw new Error("the details drew no rows");
  }
  const list = first.closest("dl")?.getBoundingClientRect();
  const row = (
    first.parentElement?.tagName === "DIV" ? first.parentElement : first
  ).getBoundingClientRect();
  const type = (element: Element) => {
    const style = getComputedStyle(element);
    return [style.fontSize, style.lineHeight, style.color];
  };
  return {
    isStacked:
      value.getBoundingClientRect().top >= first.getBoundingClientRect().bottom,
    row: [row.height, row.left - (list?.left ?? 0)],
    term: type(first),
    value: type(value),
    card: getComputedStyle(first.closest("[data-slot=card]") ?? document.body)
      .borderTopWidth,
  };
}

test("draws an Android phone's details as flush two-line rows", async () => {
  const drawn = await detailsOn("android");

  expect(drawn).toEqual({
    isStacked: true,
    row: [72, 0],
    term: ["16px", "24px", "rgb(44, 53, 46)"],
    value: ["14px", "20px", "rgb(88, 97, 90)"],
    card: "0px",
  });
});

test("keeps an iPhone's details as a side by side list in a card", async () => {
  const drawn = await detailsOn("ios");

  expect(drawn.isStacked).toBe(false);
  expect(drawn.card).toBe("1px");
});

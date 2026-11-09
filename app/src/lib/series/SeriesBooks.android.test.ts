import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { book, chapter } from "./book-fixture.ts";
import SeriesBooksHarness from "./SeriesBooksHarness.svelte";

const PHONE = { width: 400, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function headOn(platform: Platform) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(SeriesBooksHarness, { platform, books: [book(1), book(2)] });
  await expect.element(page.getByRole("heading", { level: 2 })).toBeVisible();
  const type = (element: Element) => {
    const style = getComputedStyle(element);
    return [
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ];
  };
  const box = (element: Element) => {
    const { width, height } = element.getBoundingClientRect();
    return [width, height];
  };
  const title = page.getByRole("heading", { level: 2 }).element();
  const summary = title.nextElementSibling;
  const sort = page.getByRole("button", { name: /^Sort/ }).element();
  const find = page.getByRole("button", { name: "Find a book" }).element();
  const shown = page.getByRole("radio").first().element();
  return {
    title: type(title),
    summary: summary === null ? [] : type(summary),
    sort: box(sort),
    find: box(find),
    shownHeight: box(shown)[1],
  };
}

test("sets an Android phone's book list head in title and callout type with 40px icon buttons", async () => {
  expect(await headOn("android")).toEqual({
    title: ["16px", "24px", "500", "0.15px"],
    summary: ["14px", "20px", "400", "0.25px"],
    sort: [40, 40],
    find: [40, 40],
    shownHeight: 40,
  });
});

test("keeps an iPhone's book list head title as it was", async () => {
  const drawn = await headOn("ios");

  expect(drawn.title).toEqual(["18px", "24px", "600", "normal"]);
});

async function runHeadingsOn(platform: Platform) {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform(platform);
  await render(SeriesBooksHarness, {
    platform,
    sections: ["chapters"],
    books: [chapter(14), chapter(13), chapter(12), chapter(1)],
  });
  await expect.element(page.getByRole("list", { name: "Books" })).toBeVisible();
  return page
    .getByRole("list", { name: "Books" })
    .getByRole("heading", { level: 3 })
    .elements()
    .map((heading) => heading.textContent.trim());
}

test("heads an Android phone's chapters with a list heading for each run of twelve", async () => {
  expect(await runHeadingsOn("android")).toEqual([
    "Chapters 13–14",
    "Chapters 1–12",
  ]);
});

test("keeps an iPhone's chapters in one run without headings", async () => {
  expect(await runHeadingsOn("ios")).toEqual([]);
});

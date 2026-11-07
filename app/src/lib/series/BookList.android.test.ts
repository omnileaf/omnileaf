import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform, type PhonePlatform } from "#lib/page/platform.ts";

import { book } from "./book-fixture.ts";
import BookListHarness from "./BookListHarness.svelte";

const PHONE = { width: 400, height: 800 } as const;

const BOOKS = [book(1, { state: "read" }), book(2, { state: "notStarted" })];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function rowsOn(platform: PhonePlatform) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(BookListHarness, {
    phone: platform,
    books: BOOKS,
  });
  await expect.element(page.getByText("Volume 2").first()).toBeVisible();
  const titles = [...document.querySelectorAll('[data-slot="item-title"]')];
  const subtitles = [
    ...document.querySelectorAll('[data-slot="item-description"]'),
  ];
  const type = (element: Element | undefined) => {
    const style = element === undefined ? undefined : getComputedStyle(element);
    return [
      style?.fontSize,
      style?.lineHeight,
      style?.fontWeight,
      style?.letterSpacing,
      style?.color,
    ];
  };
  return {
    titles: titles.map(type),
    subtitle: type(subtitles[0]),
    rowHeight: titles[0]?.closest("a")?.getBoundingClientRect().height,
  };
}

test("sets an Android phone's book rows in Android's 16px title and 14px summary type, the read title muted", async () => {
  const drawn = await rowsOn("android");

  expect(drawn).toEqual({
    titles: [
      ["16px", "24px", "400", "0.5px", "rgb(88, 97, 90)"],
      ["16px", "24px", "400", "0.5px", "rgb(44, 53, 46)"],
    ],
    subtitle: ["14px", "20px", "400", "0.25px", "rgb(88, 97, 90)"],
    rowHeight: 72,
  });
});

test("keeps an iPhone's book row titles as they were", async () => {
  const drawn = await rowsOn("ios");

  expect(drawn).toEqual({
    titles: [
      ["17px", "22px", "400", "-0.43px", "oklch(0.5 0.01 286)"],
      ["17px", "22px", "400", "-0.43px", "oklch(0.145 0 0)"],
    ],
    subtitle: ["15px", "20px", "400", "-0.23px", "oklch(0.5 0.01 286)"],
    rowHeight: 72,
  });
});

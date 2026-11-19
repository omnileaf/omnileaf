import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { SeriesBook } from "#lib/ipc/bindings.ts";
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

const AWAY_BOOKS = [
  { ...book(1, { state: "read" }), file: { kind: "notConnected" } },
  book(2),
] satisfies SeriesBook[];

async function awayRowsOn(platform: PhonePlatform, touched: string[] = []) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  return render(BookListHarness, {
    phone: platform,
    books: AWAY_BOOKS,
    onNotConnected: ({ title }: SeriesBook) => touched.push(title),
  });
}

test("keeps a book that isn't connected from opening and tags its summary on an Android phone", async () => {
  const touched: string[] = [];
  const screen = await awayRowsOn("android", touched);

  const away = screen.getByRole("button", { name: /^Volume 1/ });
  await away.click();

  await expect.element(away.getByText("Not connected")).toBeVisible();
  expect({
    links: screen.getByRole("link").elements().length,
    touched,
  }).toEqual({ links: 1, touched: ["Volume 1"] });
});

test("keeps opening a book that isn't connected on an iPhone", async () => {
  const screen = await awayRowsOn("ios");

  await expect.element(screen.getByText("Volume 2")).toBeVisible();
  expect({
    links: screen.getByRole("link").elements().length,
    tags: screen.getByText("Not connected").elements().length,
  }).toEqual({ links: 2, tags: 0 });
});

test("keeps a book that isn't connected from opening and tags it on an Android tablet", async () => {
  const touched: string[] = [];
  await page.viewport(900, 800);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  const screen = await render(BookListHarness, {
    phone: undefined,
    books: AWAY_BOOKS,
    onNotConnected: ({ title }: SeriesBook) => touched.push(title),
  });

  const away = screen.getByRole("button", { name: /^Volume 1/ });
  await away.click();

  await expect.element(away.getByText("Not connected")).toBeVisible();
  expect({
    links: screen.getByRole("link").elements().length,
    touched,
  }).toEqual({ links: 1, touched: ["Volume 1"] });
});

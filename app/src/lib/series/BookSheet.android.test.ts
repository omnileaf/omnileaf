import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { book } from "./book-fixture.ts";
import BookSheet from "./BookSheet.svelte";

const STARTED = book(3, { state: "started", page: 14 });

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function openSheet(
  shown: SeriesBook,
  heard: string[] = [],
): Promise<void> {
  await page.viewport(400, 800);
  followCorePlatform("android");
  await render(BookSheet, {
    book: shown,
    isOnPhone: true,
    onMark: (mark: ReadMark) => heard.push(`mark ${mark}`),
    onSelect: () => heard.push("select"),
    onShowFile: () => heard.push("show file"),
    onDelete: () => heard.push("delete"),
  });
  await page.getByRole("button", { name: `More for ${shown.title}` }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
}

function actionNames(): string[] {
  return [
    ...page.getByRole("dialog").element().querySelectorAll("a, button"),
  ].map((action) => action.textContent.trim());
}

test("offers Mark read and Mark unread for a started book", async () => {
  const heard: string[] = [];
  await openSheet(STARTED, heard);

  await page.getByRole("button", { name: "Mark unread" }).click();

  expect(heard).toEqual(["mark unread"]);
});

test("lists Show the file after Select and before Delete", async () => {
  await openSheet(STARTED);

  const names = actionNames();

  expect(names.slice(names.indexOf("Select"))).toEqual([
    "Select",
    "Show the file",
    "Delete",
  ]);
});

test("shows the file of a book that is there", async () => {
  const heard: string[] = [];
  await openSheet(STARTED, heard);

  await page.getByRole("button", { name: "Show the file" }).click();

  expect(heard).toEqual(["show file"]);
});

test("turns Show the file off for a book whose file isn't there", async () => {
  const heard: string[] = [];
  await openSheet({ ...STARTED, file: { kind: "notConnected" } }, heard);

  const showFile = page.getByRole("button", { name: "Show the file" });
  const element = showFile.element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("Show the file drew no element");
  }
  element.click();

  await expect.element(showFile).toHaveAttribute("aria-disabled", "true");
  expect(heard).toEqual([]);
});

async function openAwaySheet(heard: string[]): Promise<void> {
  await page.viewport(400, 800);
  followCorePlatform("android");
  const away: SeriesBook = { ...STARTED, file: { kind: "notConnected" } };
  await render(BookSheet, {
    book: away,
    isOnPhone: true,
    onMark: (mark: ReadMark) => heard.push(`mark ${mark}`),
    onSelect: () => heard.push("select"),
    onShowFile: () => heard.push("show file"),
    onDelete: () => heard.push("delete"),
    onFind: () => heard.push("find"),
  });
  await page.getByRole("button", { name: `More for ${away.title}` }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
}

function clickAnyway(name: string): void {
  const element = page
    .getByRole("dialog")
    .getByRole("button", { name })
    .element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`${name} drew no element`);
  }
  element.click();
}

test("puts Find the folder first for a book that isn't connected", async () => {
  const heard: string[] = [];
  await openAwaySheet(heard);

  const names = actionNames();
  await page.getByRole("button", { name: "Find the folder" }).click();

  expect({ first: names.find((name) => name !== ""), heard }).toEqual({
    first: "Find the folder",
    heard: ["find"],
  });
});

test("turns Continue reading, Show the file and Delete off for a book that isn't connected", async () => {
  const heard: string[] = [];
  await openAwaySheet(heard);

  for (const name of ["Continue reading", "Show the file", "Delete"]) {
    clickAnyway(name);
  }

  expect({
    off: ["Continue reading", "Show the file", "Delete"].map((name) =>
      page
        .getByRole("dialog")
        .getByRole("button", { name })
        .element()
        .getAttribute("aria-disabled"),
    ),
    heard,
  }).toEqual({ off: ["true", "true", "true"], heard: [] });
});

test("keeps marking a book that isn't connected", async () => {
  const heard: string[] = [];
  await openAwaySheet(heard);

  await page.getByRole("button", { name: "Mark unread" }).click();

  expect(heard).toEqual(["mark unread"]);
});

test("offers the same actions for a book that isn't connected on an Android tablet", async () => {
  await page.viewport(900, 800);
  followCorePlatform("android");
  const heard: string[] = [];
  const away: SeriesBook = { ...STARTED, file: { kind: "notConnected" } };
  await render(BookSheet, {
    book: away,
    isOnPhone: false,
    onMark: (mark: ReadMark) => heard.push(`mark ${mark}`),
    onSelect: () => heard.push("select"),
    onShowFile: () => heard.push("show file"),
    onDelete: () => heard.push("delete"),
    onFind: () => heard.push("find"),
  });
  await page.getByRole("button", { name: `More for ${away.title}` }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();

  const names = actionNames();
  await page.getByRole("button", { name: "Find the folder" }).click();

  expect({
    first: names.find((name) => name !== ""),
    marks: names.filter((name) => name.startsWith("Mark")),
    heard,
  }).toEqual({
    first: "Find the folder",
    marks: ["Mark read", "Mark unread"],
    heard: ["find"],
  });
});

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

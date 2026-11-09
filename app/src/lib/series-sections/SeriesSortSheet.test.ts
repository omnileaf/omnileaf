import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";
import {
  type BooksOrder,
  EVERY_BOOK_IN_ORDER,
} from "#lib/series/book-listing.ts";

import SeriesSortSheet from "./SeriesSortSheet.svelte";

const ANDROID_PHONE = { width: 412, height: 915 };
async function openSheet(
  listing: BooksOrder = EVERY_BOOK_IN_ORDER,
): Promise<BooksOrder[]> {
  const chosen: BooksOrder[] = [];
  await render(SeriesSortSheet, {
    listing,
    isOpen: true,
    onChoose: (next: BooksOrder) => {
      chosen.push(next);
    },
    onClose: () => undefined,
  });
  return chosen;
}

function sheet() {
  return page.getByRole("dialog", { name: "Sort and filter" });
}

beforeEach(async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await page.viewport(ANDROID_PHONE.width, ANDROID_PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("offers the order and the books to show, each with its choice marked", async () => {
  await openSheet({ shown: "unread", direction: "descending" });

  await expect
    .element(
      sheet()
        .getByRole("radiogroup", { name: "Order" })
        .getByRole("radio", { name: "Last first" }),
    )
    .toBeChecked();
  await expect
    .element(
      sheet()
        .getByRole("radiogroup", { name: "Show" })
        .getByRole("radio", { name: "Unread" }),
    )
    .toBeChecked();
});

test("says the choices hold for every tab and that gaps need All", async () => {
  await openSheet();

  await expect
    .element(sheet().getByText("For every tab of this series."))
    .toBeVisible();
  await expect
    .element(sheet().getByText("Missing-volume gaps show only with All."))
    .toBeVisible();
});

test("chooses Unread and keeps the order", async () => {
  const chosen = await openSheet();

  await userEvent.click(sheet().getByRole("radio", { name: "Unread" }));

  expect(chosen).toEqual([{ shown: "unread", direction: "ascending" }]);
});

test("chooses Last first and keeps the books shown", async () => {
  const chosen = await openSheet();

  await userEvent.click(sheet().getByRole("radio", { name: "Last first" }));

  expect(chosen).toEqual([{ shown: "all", direction: "descending" }]);
});

test("chooses every book in order on Reset", async () => {
  const chosen = await openSheet({
    shown: "bookmarked",
    direction: "descending",
  });

  await userEvent.click(sheet().getByRole("button", { name: "Reset" }));

  expect(chosen).toEqual([EVERY_BOOK_IN_ORDER]);
});

import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { SeriesBook } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { Selection } from "#lib/page/selection.svelte.ts";

import BookTable from "./BookTable.svelte";

type BookId = SeriesBook["id"];

const DESKTOP = { width: 1440, height: 900 } as const;

function bookNumbered(position: number): SeriesBook {
  return {
    id: `0190a3e4-0000-8000-8000-00000000b${String(position).padStart(3, "0")}` as BookId,
    position,
    title: `Volume ${String(position)}`,
    cover: null,
    addedAtMs: 0,
    reading: { state: "notStarted" },
    pageCount: 180,
    isBookmarked: false,
    isNew: false,
    isFileMissing: false,
    kind: null,
    numbers: null,
    volume: null,
    section: "volumes",
  };
}

const BOOKS = [1, 2, 3, 4].map((position) => ({
  ...bookNumbered(position),
  ...(position === 2
    ? { reading: { state: "started", page: 10 } as const }
    : {}),
}));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function tableOn(platform: "macos" | "linux") {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  document.body.append(document.createElement("main"));
  const selection = new Selection<BookId>();
  const [first] = BOOKS;
  if (first !== undefined) {
    selection.toggle(first.id);
  }
  await render(BookTable, {
    books: BOOKS,
    dates: new Intl.DateTimeFormat("en"),
    isComplete: true,
    onNearEnd: () => undefined,
    selection,
    isPickingAll: false,
    onPickAll: () => undefined,
    onClear: () => undefined,
    onMark: () => undefined,
  });
}

function cellsOf(row: number): HTMLElement[] {
  const rows = document.querySelectorAll("tbody tr");
  const cells = rows.item(row).querySelectorAll("td");
  return [...cells].filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLElement,
  );
}

test("draws the books as 20 point striped rows under a 31 point header on macOS", async () => {
  await tableOn("macos");

  const header = document.querySelector("th");
  const second = cellsOf(1)[1];

  expect(header?.getBoundingClientRect().height).toBe(31);
  expect(second?.getBoundingClientRect().height).toBe(20);
  expect(getComputedStyle(header ?? document.body).fontSize).toBe("11px");
});

test("fills the picked row with the accent and stripes the odd rows on macOS", async () => {
  await tableOn("macos");

  const picked = getComputedStyle(cellsOf(0)[1] ?? document.body);
  const striped = getComputedStyle(cellsOf(2)[1] ?? document.body);
  const plain = getComputedStyle(cellsOf(1)[1] ?? document.body);

  expect(picked.backgroundColor).toBe(
    resolvedColour("--color-accent", "backgroundColor"),
  );
  expect(striped.backgroundColor).not.toBe(plain.backgroundColor);
  expect(plain.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("lays the books on the page rather than in a card on macOS", async () => {
  await tableOn("macos");

  const card = document.querySelector("[data-slot=card]");
  const style = getComputedStyle(card ?? document.body);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.boxShadow).toMatch(/^(none|rgba\(0, 0, 0, 0\))/);
});

test("keeps the card and the tall rows on Linux", async () => {
  await tableOn("linux");

  const card = document.querySelector("[data-slot=card]");

  expect(getComputedStyle(card ?? document.body).borderTopWidth).toBe("1px");
  expect(cellsOf(1)[1]?.getBoundingClientRect().height).toBeGreaterThan(40);
});

test("draws the progress words and bar side by side on macOS", async () => {
  await tableOn("macos");

  const cell = cellsOf(1)[4];
  const words = cell?.querySelector("span span");
  const bar = cell?.querySelector("[role=progressbar]");

  expect(words?.getBoundingClientRect().right).toBeLessThanOrEqual(
    (bar?.getBoundingClientRect().left ?? 0) + 1,
  );
});

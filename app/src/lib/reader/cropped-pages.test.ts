import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";

import type { BookPage } from "#lib/ipc/bindings.ts";

import { croppedPages, pageCrop, suitsMode } from "./cropped-pages";

function pageOf(index: number): BookPage {
  return {
    path: `pages/${String(index)}` as BookPage["path"],
    thumbnail: `thumbnails/pages/${String(index)}` as BookPage["thumbnail"],
    size: { width: 1000, height: 1500 },
  };
}

function bookPages(): BookPage[] {
  return [pageOf(0), pageOf(1)];
}

afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

test("shows whole pages while Crop white borders is off", () => {
  expect(pageCrop(false, false)).toBe("whole");
  expect(pageCrop(false, true)).toBe("whole");
});

test("crops every border of a page turned one at a time", () => {
  expect(pageCrop(true, false)).toBe("borders");
});

test("crops only the sides of a page in the long strip", () => {
  expect(pageCrop(true, true)).toBe("sideBorders");
});

test("fits whole pages to either mode and each crop to its own mode only", () => {
  expect(suitsMode("whole", true)).toBe(true);
  expect(suitsMode("whole", false)).toBe(true);
  expect(suitsMode("borders", false)).toBe(true);
  expect(suitsMode("borders", true)).toBe(false);
  expect(suitsMode("sideBorders", true)).toBe(true);
  expect(suitsMode("sideBorders", false)).toBe(false);
});

test("swaps each page's path for the cropped one the core names", async () => {
  mockIPC((command, payload) => {
    expect(command).toBe("cropped_page_paths");
    expect(payload).toEqual({
      paths: ["pages/0", "pages/1"],
      crop: "borders",
    });
    return ["pages/0/cropped", "pages/1/cropped"];
  });

  const pages = bookPages();

  const answer = await croppedPages(pages, "borders");

  expect(answer.crop).toBe("borders");
  expect(answer.pages.map((page) => page.path)).toEqual([
    "pages/0/cropped",
    "pages/1/cropped",
  ]);
  expect(answer.pages[0]?.size).toEqual(pages[0]?.size);
});

test("asks the core once for a book's pages cropped the same way", async () => {
  const asked = vi.fn(() => ["pages/0/cropped", "pages/1/cropped"]);
  mockIPC(asked);
  const pages = bookPages();
  await croppedPages(pages, "borders");

  const again = await croppedPages(pages, "borders");

  expect(asked).toHaveBeenCalledOnce();
  expect(again.pages.map((page) => page.path)).toEqual([
    "pages/0/cropped",
    "pages/1/cropped",
  ]);
});

test("asks the core again for the same book cropped another way", async () => {
  const asked = vi.fn(() => ["pages/0", "pages/1"]);
  mockIPC(asked);
  const pages = bookPages();
  await croppedPages(pages, "borders");

  await croppedPages(pages, "sideBorders");

  expect(asked).toHaveBeenCalledTimes(2);
});

test("reports the core's failure and falls back to the whole pages", async () => {
  const failure = new Error("read a page path the library didn't give out");
  mockIPC(() => {
    throw failure;
  });
  const reported = vi
    .spyOn(globalThis, "reportError")
    .mockImplementation(() => {});

  const pages = bookPages();

  await expect(croppedPages(pages, "sideBorders")).resolves.toEqual({
    pages,
    crop: "whole",
  });
  expect(reported).toHaveBeenCalledWith(failure);
});

test("reports a core answer that names a different number of pages and falls back to the whole pages", async () => {
  mockIPC(() => ["pages/0/cropped"]);
  const reported = vi
    .spyOn(globalThis, "reportError")
    .mockImplementation(() => {});

  const pages = bookPages();

  const answer = await croppedPages(pages, "borders");

  expect(answer).toEqual({ pages, crop: "whole" });
  expect(reported).toHaveBeenCalledOnce();
});

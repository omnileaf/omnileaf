import { expect, test } from "vitest";

import { startPage } from "./start-page";

test("opens a started book on the page reading goes on from", () => {
  const page = startPage({ state: "started", page: 14 });

  expect(page).toBe(13);
});

test("opens a book on its first page when nothing says where reading goes on", () => {
  const pages = [
    startPage({ state: "notStarted" }),
    startPage({ state: "started", page: null }),
    startPage({ state: "read" }),
  ];

  expect(pages).toEqual([0, 0, 0]);
});

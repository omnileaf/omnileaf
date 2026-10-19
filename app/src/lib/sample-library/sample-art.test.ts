import { expect, test } from "vitest";

import { sampleArt } from "./sample-art.ts";

test("draws a series' cover in its board colour", () => {
  const cover = sampleArt("covers/4-2");

  expect(cover).toContain("<svg");
  expect(cover).toContain("oklch(0.6 0.118 184.704)");
});

test("numbers each page it draws", () => {
  const page = sampleArt("pages/4-2-3-14");

  expect(page).toContain(">14<");
});

test("draws a thumbnail as the page it stands for", () => {
  expect(sampleArt("thumbnails/pages/4-2-3-14")).toBe(
    sampleArt("pages/4-2-3-14"),
  );
});

test("draws nothing for a path it doesn't know", () => {
  expect(sampleArt("elsewhere/4")).toBeUndefined();
});

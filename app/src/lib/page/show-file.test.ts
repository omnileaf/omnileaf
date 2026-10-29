import { expect, test } from "vitest";

import { openedFromLabel, showFileLabel, showFolderLabel } from "./show-file";

test("names showing a book's file in each platform's own words", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    showFileLabel,
  );

  expect(labels).toEqual([
    "Show in Files",
    "Show the file",
    "Show in Finder",
    "Show in File Explorer",
    "Show in folder",
  ]);
});

test("names showing a series' folder as the series page's menu says it", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    showFolderLabel,
  );

  expect(labels).toEqual([
    "Show in Files",
    "Show the folder",
    "Show in folder",
    "Show in folder",
    "Show in folder",
  ]);
});

test("names where a book opened from, in each platform's own words", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    openedFromLabel,
  );

  expect(labels).toEqual([
    "Opened from Files",
    "Opened from your file manager",
    "Opened from Finder",
    "Opened from File Explorer",
    "Opened from your file manager",
  ]);
});

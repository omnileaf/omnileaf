import { expect, test } from "vitest";

import { showFileLabel } from "./show-file";

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

import { expect, test } from "vitest";

import { sourceLine } from "./detail-source.ts";

test("says a value came from the folder name with a folder icon", () => {
  expect(sourceLine("folderName", false)).toEqual({
    words: "From the folder name",
    icon: "folder",
  });
});

test("says a value came from the file names or the files with a file icon", () => {
  expect(sourceLine("fileName", false)).toEqual({
    words: "From the file names",
    icon: "file-text",
  });
  expect(sourceLine("files", false)).toEqual({
    words: "From the files (ComicInfo.xml)",
    icon: "file-text",
  });
});

test("says an edited value was edited by you with a pencil, whatever its file gave", () => {
  const edited = { words: "Edited by you", icon: "pencil" };

  expect(sourceLine("files", true)).toEqual(edited);
  expect(sourceLine(null, true)).toEqual(edited);
});

test("says nothing for a value with no known source", () => {
  expect(sourceLine(null, false)).toBeUndefined();
});

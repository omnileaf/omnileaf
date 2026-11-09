import { expect, test } from "vitest";

import { sourceLine } from "./detail-source.ts";

test("says a value came from the folder name, the file names or the files", () => {
  expect(sourceLine("folderName", false)).toBe("From the folder name");
  expect(sourceLine("fileName", false)).toBe("From the file names");
  expect(sourceLine("files", false)).toBe("From the files (ComicInfo.xml)");
});

test("says an edited value was edited by you, whatever its file gave", () => {
  expect(sourceLine("files", true)).toBe("Edited by you");
  expect(sourceLine(null, true)).toBe("Edited by you");
});

test("says nothing for a value with no known source", () => {
  expect(sourceLine(null, false)).toBeUndefined();
});

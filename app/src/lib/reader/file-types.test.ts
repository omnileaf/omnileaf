import { expect, test } from "vitest";

import { fileKindsOpened, fileTypeLabel } from "./file-types.ts";

test("names a file type by its extension in capitals", () => {
  const label = fileTypeLabel("cbr");

  expect(label).toBe("CBR");
});

test("lists the kinds of file Omnileaf opens, archives first", () => {
  const kinds = fileKindsOpened();

  expect(kinds).toEqual(["CBZ", "CB7", "Folders of images"]);
});

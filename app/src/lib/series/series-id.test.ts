import { expect, test } from "vitest";

import { seriesIdIn } from "./series-id";

test("reads a series id from the address that names it", () => {
  const id = seriesIdIn("0190a3e4-0000-8000-8000-0000000000a1");

  expect(id).toBe("0190a3e4-0000-8000-8000-0000000000a1");
});

test("reads no series id from text that isn't one", () => {
  const ids = [
    "",
    "Sample Series 01",
    "0190a3e4-0000-8000-8000-0000000000a1/books",
    "0190a3e4000080008000000000000a1",
  ].map(seriesIdIn);

  expect(ids).toEqual([undefined, undefined, undefined, undefined]);
});

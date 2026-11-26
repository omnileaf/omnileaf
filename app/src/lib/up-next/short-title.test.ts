import { expect, test } from "vitest";

import { shortTitle } from "./short-title.ts";

test("keeps a book's name up to its first separator", () => {
  expect(shortTitle("Volume 4 · A Quiet Season by the Northern Sea")).toBe(
    "Volume 4",
  );
});

test("keeps a name with no separator whole", () => {
  expect(shortTitle("Volume 4")).toBe("Volume 4");
});

test("keeps a name that starts with a separator whole", () => {
  expect(shortTitle(" · Interlude")).toBe(" · Interlude");
});

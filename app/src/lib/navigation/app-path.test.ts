import { expect, test } from "vitest";

import { resolvedPathOf } from "./app-path";

test.each([
  ["http://localhost/history", "/history"],
  [
    "http://localhost/series/7/edit?from=3#cover",
    "/series/7/edit?from=3#cover",
  ],
  ["tauri://localhost/search?q=lantern", "/search?q=lantern"],
])("goes to %s by the path %s, leaving out the origin", (address, path) => {
  expect(resolvedPathOf(new URL(address))).toBe(path);
});

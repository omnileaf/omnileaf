import { expect, test } from "vitest";

import { sectionOf } from "./sections";

test.each([
  ["/", "library"],
  ["/browse", "browse"],
  ["/history", "history"],
  ["/settings", "settings"],
  ["/settings/about", "settings"],
] as const)("puts %s in the %s section", (pathname, section) => {
  expect(sectionOf(pathname)).toBe(section);
});

test("puts an unknown page in the library section", () => {
  expect(sectionOf("/somewhere-else")).toBe("library");
});

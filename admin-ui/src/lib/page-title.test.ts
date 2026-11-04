import { expect, test } from "vitest";

import { documentTitle } from "#lib/page-title.ts";

test("names the page before the admin", () => {
  expect(documentTitle("Dashboard")).toBe("Dashboard · Omnileaf admin");
});

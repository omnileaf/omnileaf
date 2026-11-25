import { expect, test } from "vitest";

import { ENTRIES_KEPT_BEHIND, waysBackFrom } from "./ways-back";

const SERIES = ["/series/a", "/series/b", "/series/c", "/series/d"];

test("keeps only the nearest entries behind the shown page", () => {
  const ways = waysBackFrom({
    pathname: "/series/e",
    entries: ["/", ...SERIES, "/series/e"],
    backPath: undefined,
  });

  expect([...ways].filter((way) => way.startsWith("/series/"))).toEqual(
    SERIES.slice(-ENTRIES_KEPT_BEHIND),
  );
});

test("never keeps the shown page", () => {
  const ways = waysBackFrom({
    pathname: "/settings/privacy",
    entries: ["/settings", "/settings/privacy"],
    backPath: "/settings",
  });

  expect(ways.has("/settings/privacy")).toBe(false);
});

test("keeps the pages above the shown page and the page its back link leads to", () => {
  const ways = waysBackFrom({
    pathname: "/settings/privacy/permissions",
    entries: ["/settings/privacy/permissions"],
    backPath: "/series/a",
  });

  expect([...ways].sort()).toEqual(
    ["/", "/series/a", "/settings", "/settings/privacy"].sort(),
  );
});

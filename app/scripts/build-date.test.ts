import { expect, test } from "vitest";

import { buildDateOf } from "./build-date.ts";

const COMMITTED = "2026-10-15T09:30:00+11:00";

test("dates the build by SOURCE_DATE_EPOCH, as reproducible builds set it", () => {
  const date = buildDateOf({
    sourceDateEpoch: "1792022400",
    commitDate: () => COMMITTED,
  });

  expect(date).toBe("2026-10-15T00:00:00.000Z");
});

test("dates the build by its commit when no epoch is set", () => {
  const date = buildDateOf({
    sourceDateEpoch: undefined,
    commitDate: () => COMMITTED,
  });

  expect(date).toBe("2026-10-14T22:30:00.000Z");
});

test("leaves the build undated when neither is known", () => {
  const date = buildDateOf({
    sourceDateEpoch: "not a number",
    commitDate: () => undefined,
  });

  expect(date).toBeUndefined();
});

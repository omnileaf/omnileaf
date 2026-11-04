import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { LIST_LIMIT } from "#lib/wire.ts";

const RELAY_SOURCE = new URL(
  "../../../crates/omnileaf-admin/src/relay.rs",
  import.meta.url,
);
const SERVICE_LIMIT = /const LIST_LIMIT: usize = (\d+);/;

function serviceLimit(): number {
  const source = readFileSync(RELAY_SOURCE, { encoding: "utf8" });
  return Number(SERVICE_LIMIT.exec(source)?.[1] ?? Number.NaN);
}

test("finds the limit the service asks the relay for", () => {
  expect(serviceLimit()).toBeGreaterThan(0);
});

test("counts as many reports as the service lists", () => {
  expect(LIST_LIMIT).toBe(serviceLimit());
});

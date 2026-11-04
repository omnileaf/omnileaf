import { expect, test } from "vitest";

import { filterToQuery } from "#lib/reports-query.ts";

test("writes no query without a filter", () => {
  expect(filterToQuery({})).toBe("");
});

test("writes no query for blank values", () => {
  expect(filterToQuery({ search: "", platform: "" })).toBe("");
});

test("keeps the status in the query", () => {
  expect(filterToQuery({ status: "received" })).toBe("?status=received");
});

test("writes every part in a fixed order", () => {
  expect(
    filterToQuery({
      version: "1.2.0",
      platform: "linux",
      status: "reviewing",
      search: "R-1111",
    }),
  ).toBe("?q=R-1111&status=reviewing&platform=linux&version=1.2.0");
});

test("escapes characters that would end a query value", () => {
  expect(filterToQuery({ search: "a b&c=d#e" })).toBe("?q=a+b%26c%3Dd%23e");
});

test("writes no query for a search of only spaces", () => {
  expect(filterToQuery({ search: "   " })).toBe("");
});

test("keeps the spaces around a search that has words", () => {
  expect(filterToQuery({ search: " a " })).toBe("?q=+a+");
});

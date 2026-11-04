import { expect, test } from "vitest";

import { filterToQuery, queryToFilter } from "#lib/reports-query.ts";

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

test("reads an empty query as no filter", () => {
  expect(queryToFilter(new URLSearchParams(""))).toEqual({});
});

test("reads every part of the filter back", () => {
  const parameters = new URLSearchParams(
    "q=R-1111&status=reviewing&platform=linux&version=1.2.0",
  );

  expect(queryToFilter(parameters)).toEqual({
    search: "R-1111",
    status: "reviewing",
    platform: "linux",
    version: "1.2.0",
  });
});

test("ignores a status no report can have", () => {
  expect(queryToFilter(new URLSearchParams("status=archived"))).toEqual({});
});

test("ignores blank parts and parts it does not know", () => {
  expect(
    queryToFilter(new URLSearchParams("q=&platform=&page=2&status=")),
  ).toEqual({});
});

test("keeps the spaces a visitor typed in the search", () => {
  expect(queryToFilter(new URLSearchParams("q=a+b+"))).toEqual({
    search: "a b ",
  });
});

test("gives back the filter that was written", () => {
  const filter = {
    search: "a b&c",
    status: "closed",
    platform: "ios",
    version: "2.0.0-beta.1",
  } as const;

  const query = filterToQuery(filter);

  expect(queryToFilter(new URLSearchParams(query))).toEqual(filter);
});

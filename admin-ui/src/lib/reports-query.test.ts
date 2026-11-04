import { expect, test } from "vitest";

import {
  changeFilter,
  filterToQuery,
  queryToFilter,
} from "#lib/reports-query.ts";

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

test("sets one part of the filter and keeps the others", () => {
  expect(
    changeFilter({ status: "received", platform: "linux" }, "version", "1.2.0"),
  ).toEqual({ status: "received", platform: "linux", version: "1.2.0" });
});

test("replaces a part that is already set", () => {
  expect(changeFilter({ platform: "linux" }, "platform", "ios")).toEqual({
    platform: "ios",
  });
});

test.each(["search", "status", "platform", "version"] as const)(
  "drops the %s part when it is emptied",
  (part) => {
    const filter = {
      search: "a",
      status: "closed",
      platform: "ios",
      version: "1.0.0",
    } as const;

    const changed = changeFilter(filter, part, "");

    expect(part in changed).toBe(false);
    expect(Object.keys(changed)).toHaveLength(3);
  },
);

test("refuses a status no report can have", () => {
  expect(changeFilter({}, "status", "archived")).toEqual({});
});

test("keeps the search exactly as typed", () => {
  expect(changeFilter({}, "search", " a ")).toEqual({ search: " a " });
});

test("keeps a search of only spaces while it is typed", () => {
  expect(changeFilter({ status: "closed" }, "search", " ")).toEqual({
    status: "closed",
    search: " ",
  });
});

test("keeps a space typed after the other parts of the filter", () => {
  expect(
    changeFilter({ search: "a", platform: "linux" }, "search", "a "),
  ).toEqual({ search: "a ", platform: "linux" });
});

test("keeps a typed search of only spaces when another part changes", () => {
  expect(changeFilter({ search: " " }, "platform", "linux")).toEqual({
    search: " ",
    platform: "linux",
  });
});

test("ignores a platform or version of only spaces in the address", () => {
  expect(queryToFilter(new URLSearchParams("platform=%20&version=+"))).toEqual(
    {},
  );
});

test("trims the spaces around a platform and a version in the address", () => {
  expect(
    queryToFilter(new URLSearchParams("platform=%20linux%20&version=1.2.0+")),
  ).toEqual({ platform: "linux", version: "1.2.0" });
});

test("drops a platform of only spaces when it is chosen", () => {
  expect(changeFilter({ status: "closed" }, "platform", "  ")).toEqual({
    status: "closed",
  });
});

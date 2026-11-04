import { expect, test } from "vitest";

import {
  awaitingReview,
  countByPlatform,
  countByStatus,
  countByVersion,
  filterReports,
  isFiltering,
} from "#lib/reports.ts";
import { aCode, aListed } from "#lib/testing.ts";

const PUBLISHED = aListed({
  code: aCode("R-2222-2222"),
  receivedAt: 300,
  status: { kind: "published", issue: 42 },
  platform: "linux",
  version: "1.3.0",
});
const NEWER_RECEIVED = aListed({
  code: aCode("R-3333-3333"),
  receivedAt: 200,
  platform: "linux",
  version: "1.2.0",
});
const OLDER_RECEIVED = aListed({
  code: aCode("R-1111-1111"),
  receivedAt: 100,
  platform: "android",
  version: "1.2.0",
});
const CLOSED = aListed({
  code: aCode("R-4444-4444"),
  receivedAt: 50,
  status: { kind: "closed" },
  platform: "android",
  version: "1.0.0",
});
const REPORTS = [PUBLISHED, NEWER_RECEIVED, OLDER_RECEIVED, CLOSED];

const CODE_WITH_42 = aListed({
  code: aCode("R-2422-1111"),
  receivedAt: 150,
  platform: "windows",
});
const VERSION_WITH_42 = aListed({
  code: aCode("R-5555-5555"),
  receivedAt: 160,
  version: "1.42.0",
});
const LOOKALIKES = [PUBLISHED, CODE_WITH_42, VERSION_WITH_42];

function codesOf(reports: readonly { code: string }[]): string[] {
  return reports.map((report) => report.code);
}

test("counts reports by status and keeps the empty ones at zero", () => {
  expect(countByStatus(REPORTS)).toEqual({
    received: 2,
    reviewing: 0,
    published: 1,
    duplicate: 0,
    closed: 1,
  });
});

test("counts no reports at all as zero in every status", () => {
  expect(Object.values(countByStatus([]))).toEqual([0, 0, 0, 0, 0]);
});

test("counts reports by platform, most first then by name", () => {
  expect(countByPlatform(REPORTS)).toEqual([
    { label: "android", count: 2 },
    { label: "linux", count: 2 },
  ]);
  expect(countByPlatform([PUBLISHED, OLDER_RECEIVED, NEWER_RECEIVED])).toEqual([
    { label: "linux", count: 2 },
    { label: "android", count: 1 },
  ]);
});

test("counts reports by version, most first then newest version first", () => {
  expect(countByVersion(REPORTS)).toEqual([
    { label: "1.2.0", count: 2 },
    { label: "1.3.0", count: 1 },
    { label: "1.0.0", count: 1 },
  ]);
});

function onVersions(versions: readonly string[]) {
  return versions.map((version) => aListed({ version }));
}

function versionLabels(versions: readonly string[]): string[] {
  return countByVersion(onVersions(versions)).map((tally) => tally.label);
}

test("ranks a release above its own pre-releases, newest pre-release first", () => {
  expect(versionLabels(["0.1.0-rc.1", "0.1.0", "0.1.0-rc.2"])).toEqual([
    "0.1.0",
    "0.1.0-rc.2",
    "0.1.0-rc.1",
  ]);
});

test("ranks a later release above an earlier release's pre-release", () => {
  expect(versionLabels(["0.1.0", "0.2.0-rc.1"])).toEqual([
    "0.2.0-rc.1",
    "0.1.0",
  ]);
});

test("compares the parts of a version as numbers", () => {
  expect(versionLabels(["1.9.0", "1.10.0"])).toEqual(["1.10.0", "1.9.0"]);
  expect(versionLabels(["0.1.0-rc.9", "0.1.0-rc.10"])).toEqual([
    "0.1.0-rc.10",
    "0.1.0-rc.9",
  ]);
});

test("keeps every report when no filter is set", () => {
  expect(filterReports(REPORTS, {})).toEqual(REPORTS);
});

test("filters by status, platform and version together", () => {
  expect(codesOf(filterReports(REPORTS, { status: "received" }))).toEqual([
    "R-3333-3333",
    "R-1111-1111",
  ]);
  expect(
    codesOf(filterReports(REPORTS, { platform: "android", version: "1.2.0" })),
  ).toEqual(["R-1111-1111"]);
  expect(
    codesOf(filterReports(REPORTS, { status: "closed", platform: "linux" })),
  ).toEqual([]);
});

test.each([
  ["a code", "r-3333", ["R-3333-3333"]],
  ["an issue number", "42", ["R-2222-2222"]],
  ["an issue number with a hash", "#42", ["R-2222-2222"]],
  ["a platform", "ANDROID", ["R-1111-1111", "R-4444-4444"]],
  ["a version", "1.3", ["R-2222-2222"]],
  ["a status", "publish", ["R-2222-2222"]],
  ["every word of the query", "android 1.0", ["R-4444-4444"]],
  ["nothing but spaces", "   ", codesOf(REPORTS)],
  ["nothing at all", "zzz", []],
])("searches for %s", (_name, search, expected) => {
  expect(codesOf(filterReports(REPORTS, { search }))).toEqual(expected);
});

test("matches a hashed number against the issue number only", () => {
  expect(codesOf(filterReports(LOOKALIKES, { search: "#42" }))).toEqual([
    "R-2222-2222",
  ]);
  expect(filterReports(LOOKALIKES, { search: "#4" })).toEqual([]);
  expect(filterReports(LOOKALIKES, { search: "#422" })).toEqual([]);
  expect(filterReports([CODE_WITH_42], { search: "#undefined" })).toEqual([]);
});

test("matches a plain number anywhere in the code, version or issue", () => {
  expect(codesOf(filterReports(LOOKALIKES, { search: "42" }))).toEqual([
    "R-2222-2222",
    "R-2422-1111",
    "R-5555-5555",
  ]);
});

test("ignores a hash with nothing after it", () => {
  expect(filterReports(LOOKALIKES, { search: "#" })).toEqual(LOOKALIKES);
});

test("combines a hashed issue number with other words", () => {
  expect(codesOf(filterReports(LOOKALIKES, { search: "#42 linux" }))).toEqual([
    "R-2222-2222",
  ]);
  expect(filterReports(LOOKALIKES, { search: "#42 windows" })).toEqual([]);
});

test("searches inside the chosen filters", () => {
  expect(
    codesOf(filterReports(REPORTS, { status: "closed", search: "android" })),
  ).toEqual(["R-4444-4444"]);
});

test("lists the received reports oldest first", () => {
  expect(codesOf(awaitingReview(REPORTS))).toEqual([
    "R-1111-1111",
    "R-3333-3333",
  ]);
});

test("lists nothing when no report is waiting", () => {
  expect(awaitingReview([PUBLISHED, CLOSED])).toEqual([]);
});

test("does not reorder the list it is given", () => {
  const copy = [...REPORTS];

  awaitingReview(copy);

  expect(copy).toEqual(REPORTS);
});

test.each([[{}], [{ search: "" }], [{ search: "   " }], [{ search: "#" }]])(
  "does not count %j as filtering",
  (filter) => {
    expect(isFiltering(filter)).toBe(false);
  },
);

test.each([
  [{ search: "a" }],
  [{ search: " a " }],
  [{ search: "#7" }],
  [{ status: "closed" }],
  [{ platform: "linux" }],
  [{ version: "1.2.0" }],
] as const)("counts %j as filtering", (filter) => {
  expect(isFiltering(filter)).toBe(true);
});

test("agrees with what filterReports keeps", () => {
  const blank = { search: "   " };

  expect(isFiltering(blank)).toBe(false);
  expect(filterReports(REPORTS, blank)).toEqual(REPORTS);
});

import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";
import type { AppleDevice } from "#lib/library/folder-location.ts";

import { type NoticeContext, sharedNotice } from "./shared-notice";

const FILE = "omnileaf-report-2026-10-16.txt";

function context(
  platform: Platform,
  appleDevice: AppleDevice = "ipad",
): NoticeContext {
  return {
    code: "R-8M4T",
    platform,
    appleDevice,
    showFolder: { label: "Show in folder", run: () => undefined },
    copyCode: { label: "Copy code", run: () => undefined },
  };
}

test("says a sent report's code is kept in Your reports", () => {
  const notice = sharedNotice({ way: "send" }, context("android"));

  expect([notice?.title, notice?.body]).toEqual([
    "Report sent",
    "Code R-8M4T · kept in Your reports",
  ]);
});

test("offers to copy a sent report's code", () => {
  const notice = sharedNotice({ way: "send" }, context("linux"));

  expect(notice?.action?.label).toBe("Copy code");
});

test("says a copied report's code is kept in Your reports", () => {
  const notice = sharedNotice({ way: "copy" }, context("linux"));

  expect([notice?.title, notice?.body]).toEqual([
    "Report copied",
    "Code R-8M4T · kept in Your reports",
  ]);
});

test("says nothing once the browser takes the report to GitHub", () => {
  const notice = sharedNotice({ way: "github" }, context("linux"));

  expect(notice).toBeUndefined();
});

test("says which folder a saved report went to and offers to show it", () => {
  const notice = sharedNotice(
    {
      way: "save",
      saved: { place: { kind: "folder", folder: "~/Downloads" }, file: FILE },
    },
    context("linux"),
  );

  expect([notice?.title, notice?.body, notice?.action?.label]).toEqual([
    "Report saved",
    `In ~/Downloads: ${FILE}`,
    "Show in folder",
  ]);
});

test("says an iPhone's saved report is in Files, with nothing to show it", () => {
  const notice = sharedNotice(
    { way: "save", saved: { place: { kind: "appFiles" }, file: FILE } },
    context("ios", "iphone"),
  );

  expect([notice?.body, notice?.action]).toEqual([
    "In Files › On My iPhone › Omnileaf › Reports",
    undefined,
  ]);
});

test("names an iPad's Files folder for the iPad", () => {
  const notice = sharedNotice(
    { way: "save", saved: { place: { kind: "appFiles" }, file: FILE } },
    context("ios", "ipad"),
  );

  expect(notice?.body).toBe("In Files › On My iPad › Omnileaf › Reports");
});

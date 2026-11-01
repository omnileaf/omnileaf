import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

import {
  editDetailsLook,
  PHONE_EDIT_DETAILS_LOOK,
  type EditDetailsLook,
} from "./edit-details-look.ts";

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

function classesOf(look: EditDetailsLook): string[] {
  return [
    look.panel,
    look.overlay,
    look.header,
    look.title,
    look.subtitle,
    look.body,
    look.actions,
  ];
}

test.each(PLATFORMS)(
  "keeps every class of the %s look through the class merge",
  (platform) => {
    const classes = classesOf(editDetailsLook(platform));

    expect(classes.map((value) => cn(value))).toEqual(classes);
  },
);

test("keeps every class of the phone look through the class merge", () => {
  const classes = classesOf(PHONE_EDIT_DETAILS_LOOK);

  expect(classes.map((value) => cn(value))).toEqual(classes);
});

test.each(["android", "ios", "windows"] as const)(
  "gives %s the Linux look",
  (platform) => {
    expect(editDetailsLook(platform)).toBe(editDetailsLook("linux"));
  },
);

test("gives macOS a sheet look of its own", () => {
  const macos = editDetailsLook("macos");

  expect(macos).not.toBe(editDetailsLook("linux"));
  expect(macos.hasBadge).toBe(false);
  expect(macos.panel.split(" ")).toContain("rounded-native-sheet");
});

test("keeps 2px above and below the macOS form so focus rings are not clipped", () => {
  const body = editDetailsLook("macos").body.split(" ");

  expect(body).toEqual(expect.arrayContaining(["py-2xs", "overflow-y-auto"]));
});

test("colours the macOS subtitle with the sheet text colour", () => {
  expect(editDetailsLook("macos").subtitle.split(" ")).toContain(
    "text-foreground",
  );
});

test("leaves letter spacing at the default for the macOS title and subtitle", () => {
  const macos = editDetailsLook("macos");

  expect(macos.title).not.toContain("tracking-");
  expect(macos.subtitle).not.toContain("tracking-");
});

test("shares the title and button choices between the phone and wide looks", () => {
  const wide = editDetailsLook("linux");

  expect(PHONE_EDIT_DETAILS_LOOK.title).toBe(wide.title);
  expect(PHONE_EDIT_DETAILS_LOOK.cancel).toBe(wide.cancel);
  expect(PHONE_EDIT_DETAILS_LOOK.save).toBe(wide.save);
});

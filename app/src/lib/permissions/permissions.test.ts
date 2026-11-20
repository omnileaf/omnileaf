import { describe, expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import {
  foldersDescription,
  foldersState,
  notificationsRow,
  permissionsSummary,
  systemSettingsLabel,
} from "./permissions";

const LINKED = ["Comics", "Manga", "Old comics"];

describe("the summary in Privacy and security", () => {
  test("says folders are allowed once one is linked", () => {
    expect(permissionsSummary(LINKED)).toBe(
      "Folders allowed; nothing else asked yet",
    );
  });

  test("says nothing was asked before a folder is linked", () => {
    expect(permissionsSummary([])).toBe("Nothing asked yet");
  });

  test("says nothing while the folders can't be read", () => {
    expect(permissionsSummary(undefined)).toBe("");
  });
});

describe("the folders row", () => {
  test("is allowed once a folder is linked", () => {
    expect(foldersState(LINKED)).toBe("allowed");
  });

  test("is not asked before a folder is linked", () => {
    expect(foldersState([])).toBe("notAsked");
  });

  test("shows no state while the folders can't be read", () => {
    expect(foldersState(undefined)).toBeUndefined();
  });

  test("names the linked folders on Android", () => {
    expect(foldersDescription("android", LINKED)).toBe(
      "Comics, Manga, and Old comics, picked with Android’s folder picker.",
    );
  });

  test.each<Platform>(["ios", "macos", "windows", "linux"])(
    "says the system's picker chose them on %s",
    (platform) => {
      expect(foldersDescription(platform, LINKED)).toBe(
        "Picked with the system’s folder picker.",
      );
    },
  );

  test("says the system's picker chooses them on Android before any is linked", () => {
    expect(foldersDescription("android", [])).toBe(
      "Picked with the system’s folder picker.",
    );
  });
});

describe("the way to the system's settings", () => {
  test.each<[Platform, string]>([
    ["android", "Open Android settings"],
    ["ios", "Open iOS Settings"],
    ["macos", "Open System Settings"],
    ["windows", "Open Windows Settings"],
  ])("is named for %s", (platform, label) => {
    expect(systemSettingsLabel(platform)).toBe(label);
  });

  test("is left out on Linux, which has no one settings app", () => {
    expect(systemSettingsLabel("linux")).toBeUndefined();
  });
});

describe("the notifications row", () => {
  test("is for finished downloads and not asked in a build without the update check", () => {
    expect(notificationsRow(false, "allowed")).toEqual({
      description: "For finished downloads. Asked when downloads arrive.",
      state: "notAsked",
    });
  });

  test("mentions updates and shows how Android stands in a build with the check", () => {
    const states = (["allowed", "notAsked", "notAllowed"] as const).map(
      (access) => notificationsRow(true, access),
    );

    expect(states).toEqual(
      ["allowed", "notAsked", "notAllowed"].map((state) => ({
        description:
          "For update notifications and finished downloads. Asked when you turn on Notify me about updates.",
        state,
      })),
    );
  });

  test("shows no state while Android hasn't answered", () => {
    expect(notificationsRow(true, undefined).state).toBeUndefined();
  });
});

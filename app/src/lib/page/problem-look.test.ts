import { expect, test } from "vitest";

import { variantClasses } from "#lib/components/ui/button/looks.ts";

import { actionGroupLook } from "./action-group.ts";
import { problemActionGroup } from "./problem-look.ts";

const TODAYS = { group: "g", main: "m", other: "o" } as const;

test("draws a Windows problem's actions as an accent button and a standard button", () => {
  const actions = problemActionGroup("windows", "expanded", TODAYS);

  expect(actions.main).toBe(
    variantClasses("primary", "regular", false, "windows"),
  );
  expect(actions.other).toBe(
    variantClasses("secondary", "regular", false, "windows"),
  );
});

test("leaves every other platform's problem actions as they were", () => {
  for (const platform of ["ios", "macos", "linux"] as const) {
    expect(problemActionGroup(platform, "compact", TODAYS)).toEqual(
      actionGroupLook(platform, "compact", TODAYS),
    );
  }
  expect(problemActionGroup("android", "expanded", TODAYS)).toEqual(
    actionGroupLook("android", "expanded", TODAYS),
  );
});

test("sets an Android phone problem's second action in the muted ink", () => {
  const actions = problemActionGroup("android", "compact", TODAYS);

  expect(actions.other.split(" ")).toContain("text-muted");
  expect(actions.main).toBe(actionGroupLook("android", "compact", TODAYS).main);
});

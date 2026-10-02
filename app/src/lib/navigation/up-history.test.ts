import { expect, test } from "vitest";

import { moveTo, wayUp } from "./up-history";

test("Library's way up is Library alone", () => {
  expect(wayUp("/")).toEqual(["/"]);
});

test("a Settings page's way up passes through Settings to Library", () => {
  expect(wayUp("/settings/appearance")).toEqual([
    "/",
    "/settings",
    "/settings/appearance",
  ]);
});

test("pushes a section opened from Library", () => {
  expect(moveTo(["/"], "/browse")).toEqual({ kind: "push" });
});

test("pushes a page opened from its section", () => {
  expect(moveTo(["/", "/settings"], "/settings/about")).toEqual({
    kind: "push",
  });
});

test("replaces a section with the one opened from it", () => {
  expect(moveTo(["/", "/browse"], "/history")).toEqual({
    kind: "replace",
    stepsBack: 0,
  });
});

test("goes back to Settings before replacing it with a section opened from one of its pages", () => {
  expect(moveTo(["/", "/settings", "/settings/about"], "/history")).toEqual({
    kind: "replace",
    stepsBack: 1,
  });
});

test("goes back to Library rather than pushing it again", () => {
  expect(moveTo(["/", "/settings", "/settings/about"], "/")).toEqual({
    kind: "back",
    steps: 2,
  });
});

test("goes back to Settings when it is opened from one of its pages", () => {
  expect(moveTo(["/", "/settings", "/settings/about"], "/settings")).toEqual({
    kind: "back",
    steps: 1,
  });
});

test("replaces the first page when the app opened somewhere other than Library", () => {
  expect(moveTo(["/settings/about"], "/")).toEqual({
    kind: "replace",
    stepsBack: 0,
  });
});

import { expect, test } from "vitest";

import { moveTo } from "./up-history";

test("lets the link through when Library is opened from Library", () => {
  expect(moveTo(["/"], "/")).toEqual({ kind: "push" });
});

test("pushes a Settings page opened straight from Library", () => {
  expect(moveTo(["/"], "/settings/appearance")).toEqual({ kind: "push" });
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

test("pushes a page opened from a Settings section that stands in for Settings", () => {
  expect(
    moveTo(["/", "/settings/general"], "/settings/general/language"),
  ).toEqual({ kind: "push" });
});

test("goes back to a Settings section that stands in for Settings when it is opened from one of its pages", () => {
  expect(
    moveTo(
      ["/", "/settings/general", "/settings/general/language"],
      "/settings/general",
    ),
  ).toEqual({ kind: "back", steps: 1 });
});

test("replaces a Settings section that stands in for Settings with another", () => {
  expect(moveTo(["/", "/settings/library"], "/settings/appearance")).toEqual({
    kind: "replace",
    stepsBack: 0,
  });
});

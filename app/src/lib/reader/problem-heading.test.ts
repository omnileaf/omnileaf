import { expect, test } from "vitest";

import { problemLayout } from "./problem-heading.ts";

test("starts a problem's heading on an Android phone, as Material does", () => {
  const layout = problemLayout("android", "compact");

  expect(layout).toBe("startColumn");
});

test("centres a problem's heading on an iPhone, as iOS does", () => {
  const layout = problemLayout("ios", "compact");

  expect(layout).toBe("centredColumn");
});

test("keeps a problem's badge beside its heading on tablets and desktops", () => {
  const layouts = [
    problemLayout("android", "medium"),
    problemLayout("ios", "medium"),
    problemLayout("ios", "expanded"),
    problemLayout("linux", "compact"),
    problemLayout("windows", "expanded"),
    problemLayout("macos", "medium"),
  ];

  expect(layouts).toEqual(Array.from({ length: 6 }, () => "row"));
});

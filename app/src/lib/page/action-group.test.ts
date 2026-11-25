import { expect, test } from "vitest";

import { type ActionLook, actionLookOn } from "./action-group";

const ELSEWHERE: ActionLook = {
  button: { look: "outline" },
  fit: "px-lg",
};

test("draws a phone's own main action on Android and iOS phones", () => {
  const looks = [
    actionLookOn("android", "compact", "main", ELSEWHERE),
    actionLookOn("ios", "compact", "main", ELSEWHERE),
  ];

  expect(looks.map(({ button }) => button)).toEqual([
    { variant: "primary", size: "regular" },
    { variant: "primary", size: "large" },
  ]);
});

test("draws the look given for anywhere else on tablets and desktops", () => {
  const looks = [
    actionLookOn("android", "medium", "main", ELSEWHERE),
    actionLookOn("ios", "expanded", "other", ELSEWHERE),
    actionLookOn("linux", "compact", "main", ELSEWHERE),
    actionLookOn("macos", "expanded", "main", ELSEWHERE),
    actionLookOn("windows", "expanded", "other", ELSEWHERE),
  ];

  expect(looks).toEqual([
    ELSEWHERE,
    ELSEWHERE,
    ELSEWHERE,
    ELSEWHERE,
    ELSEWHERE,
  ]);
});

test("fits a phone's action the way the phone's action group does", () => {
  const look = actionLookOn("android", "compact", "other", ELSEWHERE);

  expect(look).toEqual({
    button: { variant: "outline", size: "regular" },
    fit: "max-inline-full disabled:opacity-60",
  });
});

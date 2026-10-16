import { expect, test } from "vitest";

import { tapZonesFor } from "./tap-zones.ts";

test("turns from both sides around the controls with edge zones", () => {
  expect(
    tapZonesFor("edges", "previous", "next").map((zone) =>
      zone.kind === "turn" ? zone.turn : zone.kind,
    ),
  ).toEqual(["previous", "controls", "next"]);
});

test("turns back from the top and the reading-order side, on from the bottom and the other, with an L shape", () => {
  expect(
    tapZonesFor("lShape", "next", "previous").map((zone) =>
      zone.kind === "turn" ? zone.turn : zone.kind,
    ),
  ).toEqual(["previous", "next", "controls", "previous", "next"]);
});

test("leaves only the controls with zones off", () => {
  expect(tapZonesFor("off", "previous", "next")).toEqual([
    { kind: "controls" },
  ]);
});

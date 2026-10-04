import { expect, test } from "vitest";

import { PLACES, placesMatching } from "./places";

test("goes anywhere before anything is typed", () => {
  const places = placesMatching(" ", "en");

  expect(places).toEqual(PLACES);
});

test("finds a page by its name whatever its letter case", () => {
  const places = placesMatching("APPEAR", "en");

  expect(places.map((place) => place.route)).toEqual([
    "/(app)/settings/appearance",
  ]);
});

test("finds every page inside one by that page's name", () => {
  const places = placesMatching("settings", "en");

  expect(places.map((place) => place.route)).toEqual([
    "/(app)/settings",
    "/(app)/settings/library",
    "/(app)/settings/appearance",
    "/(app)/settings/general",
    "/(app)/settings/about",
  ]);
});

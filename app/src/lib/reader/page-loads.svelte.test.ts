import { expect, test } from "vitest";

import { PageLoads } from "./page-loads.svelte";
import { PAGES_LOADING_AT_ONCE } from "./page-requests";

const PAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'/%3E";
const ANOTHER_PAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='2'/%3E";
const NOT_AN_IMAGE = "data:text/plain,not an image";

function settled(image: HTMLImageElement): Promise<void> {
  return new Promise((done) => {
    image.addEventListener(
      "load",
      () => {
        done();
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        done();
      },
      { once: true },
    );
  });
}

test("takes up room for each image still loading", () => {
  const loads = new PageLoads();

  loads.load(new Image(), PAGE);
  loads.load(new Image(), ANOTHER_PAGE);

  expect(loads.room).toBe(PAGES_LOADING_AT_ONCE - 2);
});

test("gives the room back once an image loads, even one no longer on the page", async () => {
  const loads = new PageLoads();
  const image = new Image();

  loads.load(image, PAGE);
  await settled(image);

  expect(loads.room).toBe(PAGES_LOADING_AT_ONCE);
});

test("gives the room back once an image fails", async () => {
  const loads = new PageLoads();
  const image = new Image();

  loads.load(image, NOT_AN_IMAGE);
  await settled(image);

  expect(loads.room).toBe(PAGES_LOADING_AT_ONCE);
});

test("asks again for an image only when its address changes", async () => {
  const loads = new PageLoads();
  const image = new Image();
  loads.load(image, PAGE);
  await settled(image);

  loads.load(image, PAGE);
  const again = loads.room;
  loads.load(image, ANOTHER_PAGE);

  expect([again, loads.room]).toEqual([
    PAGES_LOADING_AT_ONCE,
    PAGES_LOADING_AT_ONCE - 1,
  ]);
});

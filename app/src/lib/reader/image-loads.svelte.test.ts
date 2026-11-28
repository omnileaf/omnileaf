import { afterEach, expect, test, vi } from "vitest";

import { ImageLoads } from "./image-loads.svelte";
import { LONGEST_IMAGE_LOAD_MS } from "./page-requests";

const PAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'/%3E";
const ANOTHER_PAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='2'/%3E";
const MOST = 3;
const NOT_AN_IMAGE = "data:text/plain,not an image";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function neverLoading(): HTMLImageElement {
  const image = new Image();
  Object.defineProperty(image, "src", { set: () => undefined });
  return image;
}

function neverLoadingOnThePage(): HTMLImageElement {
  const image = neverLoading();
  document.body.append(image);
  return image;
}

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
  const loads = new ImageLoads(MOST);

  loads.load(new Image(), PAGE);
  loads.load(new Image(), ANOTHER_PAGE);

  expect(loads.room).toBe(MOST - 2);
});

test("gives the room back once an image loads, even one no longer on the page", async () => {
  const loads = new ImageLoads(MOST);
  const image = new Image();

  loads.load(image, PAGE);
  await settled(image);

  expect(loads.room).toBe(MOST);
});

test("gives the room back once an image fails", async () => {
  const loads = new ImageLoads(MOST);
  const image = new Image();

  loads.load(image, NOT_AN_IMAGE);
  await settled(image);

  expect(loads.room).toBe(MOST);
});

test("asks again for an image only when its address changes", async () => {
  const loads = new ImageLoads(MOST);
  const image = new Image();
  loads.load(image, PAGE);
  await settled(image);

  loads.load(image, PAGE);
  const again = loads.room;
  loads.load(image, ANOTHER_PAGE);

  expect([again, loads.room]).toEqual([MOST, MOST - 1]);
});

test("gives the room back from an image still loading after the time limit, and says it stalled", () => {
  vi.useFakeTimers();
  const loads = new ImageLoads(MOST);
  const stalled: string[] = [];

  loads.load(neverLoadingOnThePage(), PAGE, () => {
    stalled.push(PAGE);
  });
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS);

  expect([loads.room, stalled]).toEqual([MOST, [PAGE]]);
});

test("gives the room back but says nothing of a stall once the image has left the page", () => {
  vi.useFakeTimers();
  const loads = new ImageLoads(MOST);
  const stalled: string[] = [];
  const image = neverLoadingOnThePage();
  loads.load(image, PAGE, () => {
    stalled.push(PAGE);
  });

  image.remove();
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS);

  expect([loads.room, stalled]).toEqual([MOST, []]);
});

test("says nothing of a stall of an address the image has since been asked to replace", () => {
  vi.useFakeTimers();
  const loads = new ImageLoads(MOST);
  const stalled: string[] = [];
  const image = neverLoadingOnThePage();
  loads.load(image, PAGE, () => {
    stalled.push(PAGE);
  });
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS / 2);

  loads.load(image, ANOTHER_PAGE, () => {
    stalled.push(ANOTHER_PAGE);
  });
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS / 2);

  expect(stalled).toEqual([]);
});

test("waits out the whole time limit before giving up on an image", () => {
  vi.useFakeTimers();
  const loads = new ImageLoads(MOST);
  const stalled: string[] = [];

  loads.load(neverLoadingOnThePage(), PAGE, () => {
    stalled.push(PAGE);
  });
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS - 1);

  expect([loads.room, stalled]).toEqual([MOST - 1, []]);
});

test("gives the room of a stalled image back only once when it arrives late", () => {
  vi.useFakeTimers();
  const loads = new ImageLoads(MOST);
  const image = neverLoading();
  loads.load(image, PAGE, () => undefined);
  vi.advanceTimersByTime(LONGEST_IMAGE_LOAD_MS);

  image.dispatchEvent(new Event("load"));

  expect(loads.room).toBe(MOST);
});

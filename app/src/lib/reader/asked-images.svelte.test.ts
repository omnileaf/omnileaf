import { expect, test } from "vitest";

import { AskedImages } from "./asked-images.svelte";
import { ImageLoads } from "./image-loads.svelte";

const MOST = 3;
const PAGES = [0, 1, 2, 3, 4, 5];

function pageAt(index: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><title>${String(index)}</title></svg>`,
  )}`;
}

function imagesGivenAddresses(asked: AskedImages): number {
  return PAGES.map((index) => {
    const image = new Image();
    asked.loadWhenAsked(index, pageAt(index))(image);
    return image;
  }).filter((image) => image.hasAttribute("src")).length;
}

test("asks for no more than there is room for, even when asked again before any image starts loading", () => {
  const asked = new AskedImages(new ImageLoads(MOST));

  asked.askFor(PAGES);
  asked.askFor(PAGES);

  expect(imagesGivenAddresses(asked)).toBe(MOST);
});

test("asks for the most urgent pages first", () => {
  const loads = new ImageLoads(MOST);
  const asked = new AskedImages(loads);

  asked.askFor([5, 4, 3, 2, 1, 0]);

  const given = [5, 4, 3, 2, 1, 0].filter((index) => {
    const image = new Image();
    asked.loadWhenAsked(index, pageAt(index))(image);
    return image.hasAttribute("src");
  });
  expect(given).toEqual([5, 4, 3]);
});

test("gives up a page no longer wanted before its image starts loading", () => {
  const asked = new AskedImages(new ImageLoads(MOST));
  asked.askFor([0, 1, 2]);

  asked.askFor([3, 4, 5]);

  expect(imagesGivenAddresses(asked)).toBe(MOST);
});

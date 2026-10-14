import { expect, test } from "vitest";

import {
  decodesWithin,
  FORMAT_SAMPLES,
  undecodableFormats,
} from "./format-probe";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEV/y51eZ/PLAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";
const NOT_AN_IMAGE = "data:image/jxl;base64,bm90IGFuIGltYWdl";

test("names each format whose sample the webview fails to decode", async () => {
  const undecodable = await undecodableFormats({
    webp: NOT_AN_IMAGE,
    jxl: ONE_PIXEL_PNG,
  });

  expect(undecodable).toEqual(["webp"]);
});

test("names no format when every sample decodes", async () => {
  const undecodable = await undecodableFormats({
    webp: ONE_PIXEL_PNG,
    jxl: ONE_PIXEL_PNG,
  });

  expect(undecodable).toEqual([]);
});

test("names no format in Chromium, which shows both WebP and JPEG XL", async () => {
  const undecodable = await undecodableFormats(FORMAT_SAMPLES);

  expect(undecodable).toEqual([]);
});

const WITHIN_MS = 20;

test("counts a decode that never settles as one that failed", async () => {
  const outcome = await decodesWithin(() => new Promise(() => {}), WITHIN_MS);

  expect(outcome).toBe(false);
});

test("tells a decode that succeeds in time from one that fails", async () => {
  const outcomes = await Promise.all([
    decodesWithin(() => Promise.resolve(), WITHIN_MS),
    decodesWithin(() => Promise.reject(new Error("undecodable")), WITHIN_MS),
  ]);

  expect(outcomes).toEqual([true, false]);
});

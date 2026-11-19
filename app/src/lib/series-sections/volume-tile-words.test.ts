import { expect, test } from "vitest";

import { volumeProgressOf, volumeTileMeta } from "./volume-tile-words.ts";

test("calls a volume read once every chapter in it is", () => {
  const meta = volumeTileMeta({ bookCount: 8, readCount: 8, startedCount: 8 });

  expect(meta).toBe("Read");
});

test("calls a volume unread while no chapter in it is started", () => {
  const meta = volumeTileMeta({ bookCount: 8, readCount: 0, startedCount: 0 });

  expect(meta).toBe("Unread");
});

test("counts a volume's chapters read once any is started", () => {
  const counted = [
    volumeTileMeta({ bookCount: 8, readCount: 2, startedCount: 3 }),
    volumeTileMeta({ bookCount: 8, readCount: 0, startedCount: 1 }),
  ];

  expect(counted).toEqual(["2 of 8 chapters read", "0 of 8 chapters read"]);
});

test("fills a volume in progress by its chapters read out of all of them", () => {
  const progress = volumeProgressOf({
    bookCount: 8,
    readCount: 2,
    startedCount: 3,
  });

  expect(progress).toEqual({ read: 2, total: 8 });
});

test("draws no progress for a volume not started or already read", () => {
  const drawn = [
    volumeProgressOf({ bookCount: 8, readCount: 0, startedCount: 0 }),
    volumeProgressOf({ bookCount: 8, readCount: 8, startedCount: 8 }),
  ];

  expect(drawn).toEqual([undefined, undefined]);
});

import { expect, test } from "vitest";

import { volumeTileMeta } from "./volume-tile-words.ts";

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

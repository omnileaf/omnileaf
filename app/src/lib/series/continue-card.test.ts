import { expect, test } from "vitest";

import { VOLUME_CONTINUE_WORDS } from "./continue-card.ts";

test("counts a volume's read chapters", () => {
  const counted = VOLUME_CONTINUE_WORDS.readCount({ read: 2, total: 8 });

  expect(counted).toBe("2 of 8 chapters read");
});

test("counts a volume of one chapter in the singular", () => {
  const counted = VOLUME_CONTINUE_WORDS.readCount({ read: 1, total: 1 });

  expect(counted).toBe("1 of 1 chapter read");
});

test("says every chapter in a volume is read and where new ones show up", () => {
  const said = [
    VOLUME_CONTINUE_WORDS.allRead(),
    VOLUME_CONTINUE_WORDS.allReadBody(),
  ];

  expect(said).toEqual([
    "You’ve read every chapter in this volume",
    "New chapters in its folder show up here.",
  ]);
});

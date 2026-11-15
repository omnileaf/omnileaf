import { expect, test } from "vitest";

import { historyEntryLook } from "./history-entry-look.ts";

test.each(["compact", "medium"] as const)(
  "leaves finished books without a bar on a %s Android screen, in one continuous track",
  (widthClass) => {
    const look = historyEntryLook("android", widthClass);

    expect([look.showsFinishedBar, look.barTrack]).toEqual([
      false,
      "continuous",
    ]);
  },
);

test("gives an Android phone's skeleton the cover its rows draw, and a tablet today's", () => {
  const phone = historyEntryLook("android", "compact");
  const tablet = historyEntryLook("android", "medium");

  expect(phone.coverSkeleton).toContain(phone.cover);
  expect(tablet.coverSkeleton).toContain(tablet.cover);
  expect(phone.cover).not.toBe(tablet.cover);
});

test("keeps an iPhone's finished books' bars on the split track", () => {
  const look = historyEntryLook("ios", "compact");

  expect([look.showsFinishedBar, look.barTrack]).toEqual([true, "split"]);
});

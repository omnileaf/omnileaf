import { expect, test } from "vitest";

import { ANDROID_LIST_COVER } from "#lib/library/list-row-look.ts";

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

test("gives an Android phone's rows and skeleton the list cover, and a tablet's today's cover", () => {
  const phone = historyEntryLook("android", "compact");
  const tablet = historyEntryLook("android", "medium");
  const todays = historyEntryLook("ios", "medium");

  expect(phone.cover).toBe(ANDROID_LIST_COVER);
  expect(phone.coverSkeleton).toContain(ANDROID_LIST_COVER);
  expect([tablet.cover, tablet.coverSkeleton]).toEqual([
    todays.cover,
    todays.coverSkeleton,
  ]);
});

test("keeps an iPhone's finished books' bars on the split track", () => {
  const look = historyEntryLook("ios", "compact");

  expect([look.showsFinishedBar, look.barTrack]).toEqual([true, "split"]);
});

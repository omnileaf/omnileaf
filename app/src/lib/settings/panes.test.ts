import { expect, test } from "vitest";

import type { Platform } from "$lib/ipc/bindings";

import { showsSectionsBeside } from "./panes";

const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
const TOUCH: readonly Platform[] = ["android", "ios"];
const EVERY_PLATFORM = [...DESKTOPS, ...TOUCH];

test.each(EVERY_PLATFORM)(
  "shows the sections beside the open one on %s from the expanded width",
  (platform) => {
    expect(showsSectionsBeside(platform, "expanded")).toBe(true);
  },
);

test.each(DESKTOPS)(
  "shows the sections beside the open one on %s from the medium width",
  (platform) => {
    expect(showsSectionsBeside(platform, "medium")).toBe(true);
  },
);

test.each(TOUCH)(
  "keeps the sections to their own page on a %s tablet at rail width",
  (platform) => {
    expect(showsSectionsBeside(platform, "medium")).toBe(false);
  },
);

test.each(EVERY_PLATFORM)(
  "keeps the sections to their own page on %s at the compact width",
  (platform) => {
    expect(showsSectionsBeside(platform, "compact")).toBe(false);
  },
);

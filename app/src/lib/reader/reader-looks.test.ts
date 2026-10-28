import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

import { quickSettingLook } from "./quick-setting.ts";
import { floatsReaderBars, READER_BUTTON, readerButton } from "./reader-bar.ts";

const SCREENS = [
  { platform: "ios", width: "compact", screen: "iPhone" },
  { platform: "android", width: "compact", screen: "Android phone" },
  { platform: "ios", width: "medium", screen: "iPad" },
  { platform: "android", width: "medium", screen: "Android tablet" },
  { platform: "macos", width: "compact", screen: "narrow Mac window" },
  { platform: "windows", width: "expanded", screen: "Windows desktop" },
  { platform: "linux", width: "compact", screen: "narrow Linux window" },
] as const satisfies readonly {
  platform: Platform;
  width: WidthClass;
  screen: string;
}[];

test.each(SCREENS)(
  "floats the reader's bars on the $screen only if it is an iPhone",
  ({ platform, width, screen }) => {
    expect(floatsReaderBars(platform, width)).toBe(screen === "iPhone");
  },
);

test.each(SCREENS)(
  "keeps today's reader buttons on the $screen unless it is an iPhone",
  ({ platform, width, screen }) => {
    expect(readerButton(platform, width) === READER_BUTTON).toBe(
      screen !== "iPhone",
    );
  },
);

test.each(SCREENS)(
  "draws quick settings as toolbar items on the $screen only if it is an iPhone",
  ({ platform, width, screen }) => {
    expect(quickSettingLook(platform, width).toggleLabel === "sr-only").toBe(
      screen === "iPhone",
    );
  },
);

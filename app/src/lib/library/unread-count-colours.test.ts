import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibrarySeries,
  type OnCovers,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { type Contrast, followContrast } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import { BLUE_ACCENT, BLUE_WALLPAPER } from "../../../tests/sample-wallpaper";

import CoverBadges from "./CoverBadges.svelte";
import { NEW_LIBRARY_LISTING } from "./library-listing";

type Theme = (typeof THEMES)[number];

type Size = keyof typeof SCREENS;

interface Screen {
  readonly width: number;
  readonly height: number;
}

interface UnreadBox {
  readonly top: number;
  readonly start: number;
  readonly height: number;
  readonly outline: string;
}

interface BadgeCase {
  readonly platform: Platform;
  readonly theme: Theme;
  readonly contrast: Contrast | undefined;
  readonly contrastName: string;
  readonly size: string;
  readonly screen: Screen;
}

const THEMES = ["light", "dark"] as const;
const TEXT_RATIO = 4.5;
const SCREENS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
} satisfies Record<string, Screen>;
const SIZES = ["phone", "tablet"] as const satisfies readonly Size[];
const CONTRASTS = {
  android: [undefined, "medium", "high"],
  ios: [undefined, "more"],
  linux: [undefined],
  macos: [undefined, "more"],
  windows: [undefined],
} satisfies Record<Platform, readonly (Contrast | undefined)[]>;
const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];
const ON_COVERS: OnCovers = {
  ...DEFAULT_LIBRARY_VIEW.onCovers,
  showsUnreadCount: true,
  showsLanguage: true,
};
const NO_SHADOW = "none";
const CLEAR_SHADOW = "rgba(0, 0, 0, 0) ";
const SHADOW_LAYERS = /,(?![^(]*\))/;
const WINDOWS_BLUE = {
  light: "rgb(0, 103, 192)",
  dark: "rgb(76, 194, 255)",
} satisfies Record<Theme, string>;
const LANGUAGE_BADGE_ON_A_PHONE = {
  android: { fill: "rgb(208, 232, 215)", label: "rgb(65, 87, 73)" },
  ios: { fill: "rgba(255, 255, 255, 0.78)", label: "rgb(0, 0, 0)" },
  linux: { fill: "oklch(1 0 0)", label: "oklch(0.148 0.004 228.8)" },
  macos: { fill: "oklch(1 0 0)", label: "oklch(0.145 0 0)" },
  windows: { fill: "oklch(1 0 0)", label: "oklch(0.145 0 0)" },
} satisfies Record<Platform, { fill: string; label: string }>;

const UNREAD_BOX = {
  android: {
    phone: { top: 4, start: 4, height: 16, outline: "none" },
    tablet: { top: 7, start: 7, height: 24, outline: "none" },
  },
  ios: {
    phone: { top: 5, start: 5, height: 20, outline: "none" },
    tablet: { top: 7, start: 7, height: 24, outline: "none" },
  },
  linux: {
    phone: { top: 5, start: 5, height: 22, outline: "none" },
    tablet: { top: 7, start: 7, height: 22, outline: "none" },
  },
  macos: {
    phone: { top: 5, start: 5, height: 24, outline: "none" },
    tablet: { top: 7, start: 7, height: 24, outline: "none" },
  },
  windows: {
    phone: { top: 5, start: 5, height: 16, outline: "none" },
    tablet: { top: 7, start: 7, height: 16, outline: "none" },
  },
} satisfies Record<Platform, Record<Size, UnreadBox>>;

const CASES: readonly BadgeCase[] = PLATFORMS.flatMap((platform) =>
  THEMES.flatMap((theme) =>
    CONTRASTS[platform].flatMap((contrast) =>
      Object.entries(SCREENS).map(([size, screen]) => ({
        platform,
        theme,
        contrast,
        contrastName: contrast ?? "standard",
        size,
        screen,
      })),
    ),
  ),
);

async function oneSeries(): Promise<LibrarySeries> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: "Harbour Lights",
        bookCount: 4,
        unreadCount: 3,
        cover: "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1",
        language: "ja",
        hasDownloads: false,
        isConnected: true,
      },
    ],
    next: null,
  }));
  const listed = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  const [series] = listed.status === "ok" ? listed.data.series : [];
  if (series === undefined) {
    throw new Error("the backend listed no series");
  }
  return series;
}

async function badgesOn({
  platform,
  theme,
  contrast,
  screen,
}: Omit<BadgeCase, "size" | "contrastName">): Promise<{
  unread: Element;
  language: Element;
}> {
  await page.viewport(screen.width, screen.height);
  document.documentElement.dataset.theme = theme;
  followContrast(contrast);
  followCorePlatform(platform);
  await render(CoverBadges, { series: await oneSeries(), onCovers: ON_COVERS });
  return {
    unread: page.getByRole("img", { name: "3 unread" }).element(),
    language: page.getByRole("img", { name: "Japanese" }).element(),
  };
}

function visibleShadow(element: Element): string {
  const shown = getComputedStyle(element)
    .boxShadow.split(SHADOW_LAYERS)
    .map((layer) => layer.trim())
    .filter((layer) => layer !== NO_SHADOW && !layer.startsWith(CLEAR_SHADOW));
  return shown.length > 0 ? shown.join(", ") : NO_SHADOW;
}

function boxOf(element: Element): UnreadBox {
  const style = getComputedStyle(element);
  return {
    top: Number.parseFloat(style.insetBlockStart),
    start: Number.parseFloat(style.insetInlineStart),
    height: element.getBoundingClientRect().height,
    outline: style.outlineStyle,
  };
}

beforeEach(async () => {
  await page.viewport(SCREENS.phone.width, SCREENS.phone.height);
});

afterEach(async () => {
  clearMocks();
  await followWallpaperColours("android", "omnileaf");
  await followWallpaperColours("windows", "omnileaf");
  followContrast(undefined);
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test.each(CASES)(
  "fills the unread count with the accent pair on a $platform $size in $theme at $contrastName contrast",
  async (shown) => {
    const { unread } = await badgesOn(shown);
    const style = getComputedStyle(unread);

    expect([style.backgroundColor, style.color]).toEqual([
      resolvedColour("--color-accent", "backgroundColor"),
      resolvedColour("--color-on-accent", "color"),
    ]);
    expect([
      resolvedColour("--color-danger-fill", "backgroundColor"),
      resolvedColour("--native-color-bar-badge", "backgroundColor"),
    ]).not.toContain(style.backgroundColor);
  },
);

test.each(CASES)(
  `holds the unread count at ${String(TEXT_RATIO)}:1 on a $platform $size in $theme at $contrastName contrast`,
  async (shown) => {
    const { unread } = await badgesOn(shown);

    expect(drawnContrast(unread)).toBeGreaterThanOrEqual(TEXT_RATIO);
  },
);

test.each(CASES)(
  "rims the unread count so it shows on a cover of its own colour on a $platform $size in $theme at $contrastName contrast",
  async (shown) => {
    const { unread } = await badgesOn(shown);

    expect(visibleShadow(unread)).not.toBe(NO_SHADOW);
  },
);

test.each(THEMES)(
  "fills the unread count with the Windows accent in %s",
  async (theme) => {
    followCorePlatform("windows");
    document.documentElement.dataset.theme = theme;
    await followWallpaperColours("windows", "wallpaper", {
      wallpaperColours: () => Promise.resolve({ status: "ok", data: null }),
      accentColours: () => Promise.resolve(BLUE_ACCENT),
    });

    const { unread } = await badgesOn({
      platform: "windows",
      theme,
      contrast: undefined,
      screen: SCREENS.phone,
    });

    expect(getComputedStyle(unread).backgroundColor).toBe(WINDOWS_BLUE[theme]);
    expect(drawnContrast(unread)).toBeGreaterThanOrEqual(TEXT_RATIO);
  },
);

test.each(THEMES)(
  "fills the unread count with the wallpaper's primary on an Android phone in %s",
  async (theme) => {
    followCorePlatform("android");
    document.documentElement.dataset.theme = theme;
    await followWallpaperColours("android", "wallpaper", {
      wallpaperColours: () =>
        Promise.resolve({ status: "ok", data: BLUE_WALLPAPER }),
      accentColours: () => Promise.resolve(null),
    });

    const { unread } = await badgesOn({
      platform: "android",
      theme,
      contrast: undefined,
      screen: SCREENS.phone,
    });

    expect([
      getComputedStyle(unread).backgroundColor,
      getComputedStyle(unread).color,
    ]).toEqual([
      resolvedColour(`--android-wallpaper-${theme}-primary`, "backgroundColor"),
      resolvedColour(`--android-wallpaper-${theme}-on-primary`, "color"),
    ]);
    expect(drawnContrast(unread)).toBeGreaterThanOrEqual(TEXT_RATIO);
  },
);

test.each(PLATFORMS)(
  "keeps the language badge's colours on a %s phone",
  async (platform) => {
    const { language } = await badgesOn({
      platform,
      theme: "light",
      contrast: undefined,
      screen: SCREENS.phone,
    });
    const style = getComputedStyle(language);

    expect({ fill: style.backgroundColor, label: style.color }).toEqual(
      LANGUAGE_BADGE_ON_A_PHONE[platform],
    );
  },
);

test.each(
  PLATFORMS.flatMap((platform) => SIZES.map((size) => ({ platform, size }))),
)(
  "keeps the unread count's place and size on a $platform $size",
  async ({ platform, size }) => {
    const { unread } = await badgesOn({
      platform,
      theme: "light",
      contrast: undefined,
      screen: SCREENS[size],
    });

    expect(boxOf(unread)).toEqual(UNREAD_BOX[platform][size]);
  },
);

import { defineConfig, type Project } from "@playwright/test";

import type { Platform } from "./src/lib/ipc/bindings.ts";

import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";
import { previewPortFromEnvironment } from "./tests/preview-port.ts";
import { shardFromEnvironment } from "./tests/shard.ts";
import {
  SCREEN_SWEEP_TAG,
  testGroupFromEnvironment,
} from "./tests/test-group.ts";

const PREVIEW_PORT = previewPortFromEnvironment(
  process.env.OMNILEAF_PREVIEW_PORT,
);
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;
const BUILD_AND_SERVE_MS = 180_000;

export const SCREENS = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  tablet: {
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

const SPEED_SPECS = "**/*.speed.ts";
const NATIVE_SPECS = /@native/;
const DESKTOP_ONLY_SPECS = "**/*.desktop.spec.ts";
const SCREEN_SWEEPS = new RegExp(SCREEN_SWEEP_TAG);

const shard = shardFromEnvironment(process.env.PLAYWRIGHT_SHARD);
const group = testGroupFromEnvironment(process.env.PLAYWRIGHT_GROUP);

/** Playwright gives each shard a contiguous run of tests in project order, and WebKit takes about twice as long as Chromium, so each shard pairs a Chromium project with a WebKit one. */
const PROJECT_ORDER = [
  ["chromium", "phone"],
  ["webkit", "desktop"],
  ["chromium", "tablet"],
  ["webkit", "phone"],
  ["chromium", "desktop"],
  ["webkit", "tablet"],
] as const satisfies readonly (readonly [
  "chromium" | "webkit",
  keyof typeof SCREENS,
])[];

const screenProjects = PROJECT_ORDER.map(([browserName, screen]) => ({
  name: `${browserName}-${screen}`,
  testIgnore: screen === "desktop" ? [] : [DESKTOP_ONLY_SPECS],
  ...(group === "screens" ? { grep: SCREEN_SWEEPS } : {}),
  ...(group === "rest" ? { grepInvert: SCREEN_SWEEPS } : {}),
  use: { browserName, ...SCREENS[screen] },
})) satisfies Project[];

interface PlatformOption {
  readonly platform: Platform | undefined;
}

const nativeProjects = (
  [
    ["ios", "webkit"],
    ["android", "chromium"],
  ] as const
).map(([platform, browserName]) => ({
  name: `${platform}-phone`,
  grep: NATIVE_SPECS,
  use: { browserName, ...SCREENS.phone, platform },
})) satisfies Project<PlatformOption>[];

/** Times the interface on its own, one spec at a time once every other spec has finished, so no other load can push a timing over its budget. */
const speedProject: Project = {
  name: "speed",
  testMatch: SPEED_SPECS,
  dependencies: [...screenProjects, ...nativeProjects].map(({ name }) => name),
  workers: 1,
  use: { browserName: "chromium", ...SCREENS.desktop },
};

/** A shard leaves the speed project out, since depending on every other project would pull them all into one shard. */
const projects: Project<PlatformOption>[] = [
  ...screenProjects,
  ...(group === "screens" ? [] : nativeProjects),
  ...(shard === null && group !== "screens" ? [speedProject] : []),
];

export default defineConfig<PlatformOption>({
  testDir: "tests/browser",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    ...TEST_BROWSER_CONTEXT,
    baseURL: PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects,
  shard,
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(PREVIEW_PORT)} --strictPort`,
    env: { VITE_SAMPLE_LIBRARY: "on", VITE_KIT_PAGE: "on" },
    url: PREVIEW_URL,
    reuseExistingServer: false,
    timeout: BUILD_AND_SERVE_MS,
  },
});

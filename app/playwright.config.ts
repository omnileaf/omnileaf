import { defineConfig, type Project } from "@playwright/test";

import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";
import { shardFromEnvironment } from "./tests/shard.ts";

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;

const SCREENS = {
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

const shard = shardFromEnvironment(process.env.PLAYWRIGHT_SHARD);

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
  use: { browserName, ...SCREENS[screen] },
})) satisfies Project[];

/** Times the interface on its own, one spec at a time once every other spec has finished, so no other load can push a timing over its budget. */
const speedProject: Project = {
  name: "speed",
  testMatch: SPEED_SPECS,
  dependencies: screenProjects.map(({ name }) => name),
  workers: 1,
  use: { browserName: "chromium", ...SCREENS.desktop },
};

/** A shard leaves the speed project out, since depending on every other project would pull them all into one shard. */
const projects: Project[] =
  shard === null ? [...screenProjects, speedProject] : screenProjects;

export default defineConfig({
  testDir: "tests/browser",
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
    url: PREVIEW_URL,
    reuseExistingServer: false,
  },
});

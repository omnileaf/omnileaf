import { defineConfig, type Project } from "@playwright/test";

import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;

const ENGINES = ["chromium", "webkit"] as const;

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

const screenProjects = ENGINES.flatMap((browserName) =>
  Object.entries(SCREENS).map(([screen, emulation]) => ({
    name: `${browserName}-${screen}`,
    use: { browserName, ...emulation },
  })),
) satisfies Project[];

/** Times the interface on its own once every other spec has finished, so their load can't push a timing over its budget. */
const speedProject: Project = {
  name: "speed",
  testMatch: SPEED_SPECS,
  dependencies: screenProjects.map(({ name }) => name),
  use: { browserName: "chromium", ...SCREENS.desktop },
};

const projects: Project[] = [...screenProjects, speedProject];

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
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(PREVIEW_PORT)} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: false,
  },
});

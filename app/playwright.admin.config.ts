import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";

const PREVIEW_PORT = 4180;
const PREVIEW_URL = `http://127.0.0.1:${String(PREVIEW_PORT)}`;
const BUILD_AND_SERVE_MS = 600_000;
const PHONE_WIDTH = 360;
const DESKTOP_WIDTH = 1280;
const WEBKIT_SPECS = /@webkit/;
const INTERFACE_BUILD = fileURLToPath(
  new URL("../admin-ui/build", import.meta.url),
);

export default defineConfig({
  testDir: "tests/admin",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    ...TEST_BROWSER_CONTEXT,
    baseURL: PREVIEW_URL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { viewport: { width: PHONE_WIDTH, height: 740 } } },
    {
      name: "desktop",
      use: { viewport: { width: DESKTOP_WIDTH, height: 800 } },
    },
    {
      name: "webkit-phone",
      grep: WEBKIT_SPECS,
      use: {
        browserName: "webkit",
        viewport: { width: PHONE_WIDTH, height: 740 },
      },
    },
  ],
  webServer: {
    command: `cargo run --quiet --locked -p omnileaf-admin --example preview -- 127.0.0.1:${String(PREVIEW_PORT)}`,
    cwd: "..",
    env: { ADMIN_STATIC_DIR: INTERFACE_BUILD },
    url: `${PREVIEW_URL}/admin/health`,
    reuseExistingServer: false,
    timeout: BUILD_AND_SERVE_MS,
  },
});

import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

import {
  javascriptLicences,
  type LicencesMode,
} from "./scripts/javascript-licences.ts";
import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";

const DEV_SERVER_PORT = 1420;
const APP_TEST_TIMEOUT_MS = 30_000;
const MOBILE_SESSION_TIMEOUT_MS = 330_000;
const APP_SPECS = "tests/app/**/*.e2e.ts";
const DESKTOP_ONLY_APP_SPECS = "tests/app/**/*.desktop.e2e.ts";
const ANDROID_ONLY_APP_SPECS = "tests/app/**/*.android.e2e.ts";
const HARNESS_TESTS = "tests/app/**/*.test.ts";
const BRANDING = "../branding";

const phoneDevHost = process.env.TAURI_DEV_HOST;
const licencesMode: LicencesMode =
  process.env.UPDATE_LICENCES === undefined ? "verify" : "write";
const phoneAccess =
  phoneDevHost === undefined
    ? {}
    : { host: true, hmr: { host: phoneDevHost, clientPort: DEV_SERVER_PORT } };

export default defineConfig({
  clearScreen: false,
  server: {
    port: DEV_SERVER_PORT,
    strictPort: true,
    ...phoneAccess,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: [BRANDING] },
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["custom-chosen", "preferredLanguage", "baseLocale"],
    }),
    javascriptLicences(licencesMode),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "components",
          include: ["src/**/*.test.ts"],
          expect: { requireAssertions: true },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ contextOptions: TEST_BROWSER_CONTEXT }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        test: {
          name: "harness",
          include: [HARNESS_TESTS],
          environment: "node",
          expect: { requireAssertions: true },
        },
      },
      {
        test: {
          name: "app",
          include: [APP_SPECS],
          exclude: [...configDefaults.exclude, ANDROID_ONLY_APP_SPECS],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["tests/app/desktop.ts"],
          expect: { requireAssertions: true },
          testTimeout: APP_TEST_TIMEOUT_MS,
          hookTimeout: APP_TEST_TIMEOUT_MS,
        },
      },
      {
        test: {
          name: "android",
          include: [APP_SPECS],
          exclude: [...configDefaults.exclude, DESKTOP_ONLY_APP_SPECS],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["tests/app/android.ts"],
          expect: { requireAssertions: true },
          testTimeout: APP_TEST_TIMEOUT_MS,
          hookTimeout: MOBILE_SESSION_TIMEOUT_MS,
        },
      },
      {
        test: {
          name: "ios",
          include: [APP_SPECS],
          exclude: [
            ...configDefaults.exclude,
            DESKTOP_ONLY_APP_SPECS,
            ANDROID_ONLY_APP_SPECS,
          ],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["tests/app/ios.ts"],
          expect: { requireAssertions: true },
          testTimeout: APP_TEST_TIMEOUT_MS,
          hookTimeout: MOBILE_SESSION_TIMEOUT_MS,
        },
      },
    ],
  },
});

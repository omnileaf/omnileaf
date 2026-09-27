import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";

const APP_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["baseLocale"],
    }),
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
          name: "app",
          include: ["tests/app/**/*.e2e.ts"],
          environment: "node",
          globalSetup: ["tests/app/launch.ts"],
          expect: { requireAssertions: true },
          testTimeout: APP_TEST_TIMEOUT_MS,
          hookTimeout: APP_TEST_TIMEOUT_MS,
        },
      },
    ],
  },
});

import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

import { ADMIN_BASE } from "./src/lib/paths.ts";

const SHELL = "index.html";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ fallback: SHELL }),
      paths: { base: ADMIN_BASE, relative: false },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    expect: { requireAssertions: true },
    setupFiles: ["./src/lib/tailwind-source.setup.ts"],
  },
});

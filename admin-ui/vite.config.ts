import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const BASE_PATH = "/admin";
const SHELL = "index.html";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ fallback: SHELL }),
      paths: { base: BASE_PATH, relative: false },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    expect: { requireAssertions: true },
  },
});

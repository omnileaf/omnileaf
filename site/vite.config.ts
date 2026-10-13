import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const BRANDING = "../branding";

export default defineConfig({
  server: { fs: { allow: [BRANDING] } },
  plugins: [
    tailwindcss(),
    sveltekit({ adapter: adapter(), paths: { relative: false } }),
  ],
});

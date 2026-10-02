import adapter from "@sveltejs/adapter-static";

/** @type {import("@sveltejs/kit").Config} */
const config = {
  kit: {
    adapter: adapter({ fallback: "index.html" }),
    alias: { $branding: "../branding" },
    typescript: {
      config: (tsconfig) => {
        tsconfig.include.push("../playwright.config.ts", "../scripts/**/*.ts");
      },
    },
  },
};

export default config;

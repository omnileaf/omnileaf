import js from "@eslint/js";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      ".svelte-kit/",
      "build/",
      "src/lib/paraglide/",
      "src/lib/ipc/bindings.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  svelte.configs.recommended,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "xxx", "hack"], location: "anywhere" },
      ],
      "no-inline-comments": [
        "error",
        { ignorePattern: "@ts-expect-error|prettier-ignore" },
      ],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    extends: [betterTailwindcss.configs["recommended-error"]],
    settings: {
      "better-tailwindcss": { entryPoint: "src/app.css" },
    },
    rules: {
      "better-tailwindcss/enforce-consistent-class-order": "off",
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
      "better-tailwindcss/enforce-logical-properties": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: String.raw`\[.*\]`,
              message:
                "Arbitrary values bypass the design tokens. Add a token to src/app.css instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);

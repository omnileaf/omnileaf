import js from "@eslint/js";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export const REPORT_ERROR_ONLY_CALLED = {
  selector:
    "Identifier[name='reportError']:not(CallExpression > Identifier.callee):not(CallExpression > MemberExpression.callee > Identifier.property)",
  message:
    "Call reportError where the error is handled, or pass reportFailure. Handed on as a value, Chromium web views call it with the wrong this and throw Illegal invocation.",
};

export const GOTO_OPTIONS_THROUGH_NAVIGATE_TO = {
  selector: "CallExpression[callee.name='goto'][arguments.length>1]",
  message:
    "Pass goto's options through navigateTo, so a navigation held back by an overlay keeps them.",
};

export default defineConfig(
  {
    ignores: [
      ".svelte-kit/",
      "build/",
      "src/lib/paraglide/",
      "src/lib/ipc/bindings.ts",
      "src-tauri/gen/",
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
      "no-restricted-syntax": [
        "error",
        REPORT_ERROR_ONLY_CALLED,
        GOTO_OPTIONS_THROUGH_NAVIGATE_TO,
      ],
    },
  },
  {
    files: ["src/lib/navigation/navigate-to.ts"],
    rules: {
      "no-restricted-syntax": ["error", REPORT_ERROR_ONLY_CALLED],
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

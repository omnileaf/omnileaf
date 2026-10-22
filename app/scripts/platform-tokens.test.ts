import { expect, test } from "vitest";

import tokens from "../src/lib/theme/tokens.json";
import { renderPlatformTokens } from "./platform-tokens.ts";

const COMMITTED = import.meta.glob<string>("../src/lib/theme/generated/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

const ACCENT = {
  name: "accent",
  kind: "color",
  value: {
    default: "var(--primary)",
    "ios-light": "#2f7d4f",
    "ios-dark": "#5cbf86",
    "android-light": "#2d6a46",
    "android-dark": "#93d5a7",
  },
};

const MOVE = {
  name: "move",
  kind: "duration",
  value: { default: "300ms", ios: "400ms", android: "450ms" },
  reducedMotion: "0ms",
};

const FADE = {
  name: "fade",
  kind: "duration",
  value: { default: "150ms", ios: "150ms", android: "150ms" },
};

function render(...entries: readonly object[]): ReadonlyMap<string, string> {
  return renderPlatformTokens({ tokens: entries });
}

test("writes one file per platform in the source, plus the defaults and an index", () => {
  const files = render(ACCENT, MOVE);

  expect([...files.keys()]).toEqual([
    "index.css",
    "tokens-android.css",
    "tokens-default.css",
    "tokens-ios.css",
  ]);
});

test("keeps today's value as the default wherever a theme is set", () => {
  const files = render(ACCENT, MOVE);

  expect(files.get("tokens-default.css")).toBe(
    `:root,
[data-theme] {
  --native-color-accent: var(--primary);
  --native-duration-move: 300ms;
}
`,
  );
});

test("draws a platform's single values under every theme, and its light and dark values only under their theme", () => {
  const files = render(ACCENT, MOVE);

  expect(files.get("tokens-ios.css")).toBe(
    `:root[data-platform="ios"],
:root[data-platform="ios"] [data-theme] {
  --native-duration-move: 400ms;
}

:root[data-platform="ios"],
:root[data-platform="ios"] [data-theme="light"] {
  --native-color-accent: #2f7d4f;
}

:root[data-platform="ios"][data-theme="dark"],
:root[data-platform="ios"] [data-theme="dark"] {
  --native-color-accent: #5cbf86;
}
`,
  );
});

test("leaves out the light and dark blocks for a platform with no themed values", () => {
  const files = render(MOVE);

  expect(files.get("tokens-android.css")).toBe(
    `:root[data-platform="android"],
:root[data-platform="android"] [data-theme] {
  --native-duration-move: 450ms;
}
`,
  );
});

test("exposes colours under a native name and motion under the app's own motion roles", () => {
  const files = render(ACCENT, MOVE);

  expect(files.get("index.css")).toContain(
    `@theme inline {
  --color-native-accent: var(--native-color-accent);
  --transition-duration-move: var(--native-duration-move);
}
`,
  );
});

test("exposes type tokens under Tailwind's text, leading, weight and tracking names", () => {
  const typeTokens = ["text", "leading", "weight", "tracking"].map((kind) => ({
    name: "button",
    kind,
    value: { default: "1", ios: "2" },
  }));

  const files = render(...typeTokens);

  expect(files.get("index.css")).toContain(
    `@theme inline {
  --text-native-button: var(--native-text-button);
  --leading-native-button: var(--native-leading-button);
  --font-weight-native-button: var(--native-weight-button);
  --tracking-native-button: var(--native-tracking-button);
}
`,
  );
});

test("imports the defaults before every platform file", () => {
  const files = render(ACCENT, MOVE);

  expect(files.get("index.css")).toMatch(
    /^@import "\.\/tokens-default\.css";\n@import "\.\/tokens-android\.css";\n@import "\.\/tokens-ios\.css";\n/,
  );
});

test("stops movement under reduced motion on every platform and every themed part, and keeps fades", () => {
  const files = render(FADE, MOVE);

  expect(files.get("index.css")).toContain(
    `@media (prefers-reduced-motion: reduce) {
  :root,
  :root[data-platform],
  [data-theme],
  :root[data-platform] [data-theme] {
    --native-duration-move: 0ms;
  }
}
`,
  );
});

test("matches the committed files, so a change to the source is regenerated", () => {
  const committed = Object.fromEntries(
    Object.entries(COMMITTED).map(([path, css]) => [
      path.replace("../src/lib/theme/generated/", ""),
      css,
    ]),
  );

  const rendered = Object.fromEntries(renderPlatformTokens(tokens));

  expect(committed).toEqual(rendered);
});

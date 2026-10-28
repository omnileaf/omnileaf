import { expect, test } from "vitest";

import forcedColors from "./forced-colors-windows.css?raw";
import appCss from "../../app.css?raw";
import tokens from "./tokens.json";

const MEDIA = "@media (forced-colors: active)";
const SYSTEM_COLOURS = new Set([
  "Canvas",
  "CanvasText",
  "Highlight",
  "HighlightText",
  "ButtonFace",
  "ButtonText",
]);

function selectors(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((match) =>
    (match[1] ?? "")
      .replace(MEDIA, "")
      .split(",")
      .map((selector) => selector.trim())
      .filter((selector) => selector !== ""),
  );
}

function declarations(css: string): [string, string][] {
  return [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [
    match[1] ?? "",
    (match[2] ?? "").trim(),
  ]);
}

test("draws Windows contrast themes only under forced colours", () => {
  expect(forcedColors.trimStart().startsWith(MEDIA)).toBe(true);
  expect(forcedColors.match(/@media/g)).toHaveLength(1);
});

test("scopes every forced-colours rule to the windows platform", () => {
  const all = selectors(forcedColors);

  expect(all.length).toBeGreaterThan(0);
  for (const selector of all) {
    expect(selector).toContain('[data-platform="windows"]');
  }
});

test("maps Windows roles onto CSS system colours the way the contrast themes draw them", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-button-primary")).toBe("Highlight");
  expect(mapped.get("--native-color-on-button-primary")).toBe("HighlightText");
  expect(mapped.get("--native-color-switch-off-border")).toBe("ButtonText");
  expect(mapped.get("--native-color-menu")).toBe("Canvas");
  expect(mapped.get("--native-color-on-menu")).toBe("CanvasText");
  expect(mapped.get("--native-color-accent-hover")).toBe("Highlight");
});

test("uses only system colours, and only for tokens that have a Windows value", () => {
  const withWindows = new Set(
    tokens.tokens
      .filter(
        (token) => "windows-light" in token.value || "windows" in token.value,
      )
      .map((token) => `--native-${token.kind}-${token.name}`),
  );

  for (const [property, value] of declarations(forcedColors)) {
    expect(SYSTEM_COLOURS.has(value)).toBe(true);
    expect(withWindows.has(property)).toBe(true);
  }
});

test("is loaded by the app stylesheet after the generated tokens", () => {
  const generated = appCss.indexOf("./lib/theme/generated/index.css");
  const forced = appCss.indexOf("./lib/theme/forced-colors-windows.css");

  expect(generated).toBeGreaterThan(-1);
  expect(forced).toBeGreaterThan(generated);
});

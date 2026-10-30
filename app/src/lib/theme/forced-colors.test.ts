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
  "GrayText",
  "LinkText",
  "ActiveText",
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
  expect(forcedColors.split(MEDIA)).toHaveLength(2);
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

const INFO_BAR_COLOURS = {
  "--native-color-info-bar": "Canvas",
  "--native-color-info-bar-success": "Canvas",
  "--native-color-info-bar-warning": "Canvas",
  "--native-color-info-bar-error": "Canvas",
  "--native-color-on-info-bar": "CanvasText",
  "--native-color-info-bar-edge": "CanvasText",
  "--native-color-info-bar-icon": "CanvasText",
  "--native-color-info-bar-success-icon": "CanvasText",
  "--native-color-info-bar-warning-icon": "CanvasText",
  "--native-color-info-bar-error-icon": "CanvasText",
  "--native-color-info-bar-floating": "Canvas",
  "--native-color-info-bar-floating-edge": "CanvasText",
} as const;

test("draws every InfoBar colour in the contrast theme's canvas and its text", () => {
  const mapped = new Map(declarations(forcedColors));

  const infoBarColours = Object.fromEntries(
    Object.keys(INFO_BAR_COLOURS).map((token) => [token, mapped.get(token)]),
  );

  expect(infoBarColours).toEqual(INFO_BAR_COLOURS);
});

const FOREGROUNDS_ON_HIGHLIGHT: Readonly<Record<string, readonly string[]>> = {
  "button-primary": ["on-button-primary"],
  "button-primary-hover": ["on-button-primary"],
  "button-primary-pressed": ["on-button-primary"],
  "accent-hover": [],
  "accent-pressed": [],
  "switch-on": ["switch-thumb"],
  "switch-on-border": [],
  "segment-selected": ["on-segment-selected"],
  "progress-fill": [],
  "row-pressed": [],
  "row-selected": ["on-row-selected-muted"],
  "menu-chosen": ["on-menu-chosen"],
  "menu-item-hover": [],
  "nav-item-hover": ["on-nav-item"],
  "nav-item-pressed": ["on-nav-item"],
  "nav-item-selected": ["nav-indicator", "on-nav-item"],
};

test("pairs every Highlight fill with HighlightText for the text on it", () => {
  const mapped = new Map(declarations(forcedColors));
  const highlighted = [...mapped]
    .filter(([, value]) => value === "Highlight")
    .map(([property]) => property.replace("--native-color-", ""));

  expect(highlighted.toSorted()).toEqual(
    Object.keys(FOREGROUNDS_ON_HIGHLIGHT).toSorted(),
  );
  for (const [fill, texts] of Object.entries(FOREGROUNDS_ON_HIGHLIGHT)) {
    for (const text of texts) {
      expect(mapped.get(`--native-color-${text}`), `${text} on ${fill}`).toBe(
        "HighlightText",
      );
    }
  }
});

test("turns the text of a picked or pressed row and a highlighted menu item and its accelerator to HighlightText", () => {
  const flat = forcedColors.replace(/\s+/g, " ");

  expect(flat).toMatch(
    /\[data-slot="item"\]\[data-picked\],[^{}]*\[data-slot="item"\]:active:not\(\[aria-disabled="true"\]\) \{ color: HighlightText; \}/,
  );
  expect(flat).toMatch(
    /\[role\^="menuitem"\]\[data-highlighted\],[^{}]*\[role\^="menuitem"\]\[data-highlighted\] \[data-slot="kbd"\] \{ color: HighlightText; \}/,
  );
  expect(flat).not.toContain("@media (width < 600px)");
});

test("rings focus inside in Canvas and takes no nav-item rule that reaches beyond the pane", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-focus-ring-inner")).toBe("Canvas");
  expect(forcedColors).not.toContain("nav li");
});

test("fills a hovered or pressed command bar button on Highlight with HighlightText over it, and only that button", () => {
  const squeezed = (css: string) => css.replace(/\s+/g, "");
  const idle = ':not(:disabled):not([aria-expanded="true"])';
  const buttons = (state: string, part: string) =>
    `:root[data-platform="windows"] [data-command-button]${idle}:${state}${part}`;

  expect(squeezed(forcedColors)).toContain(
    squeezed(
      `${buttons("hover", "::before")}, ${buttons("active", "::before")} { background-color: Highlight; }`,
    ),
  );
  expect(squeezed(forcedColors)).toContain(
    squeezed(
      `${buttons("hover", "")}, ${buttons("active", "")} { color: HighlightText; }`,
    ),
  );
});

test("edges Windows's flyouts in CanvasText and draws a turned-off menu item and a key hint the contrast theme's way", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-menu-edge")).toBe("CanvasText");
  expect(mapped.get("--native-color-on-menu-disabled")).toBe("GrayText");
  expect(mapped.get("--native-color-key-ink")).toBe("CanvasText");
  expect(mapped.get("--native-color-on-surface")).toBe("CanvasText");
});

test("draws Windows's disabled buttons in GrayText and its hyperlink button in LinkText", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-on-button-disabled")).toBe("GrayText");
  expect(mapped.get("--native-color-on-button-primary-disabled")).toBe(
    "GrayText",
  );
  expect(mapped.get("--native-color-button-primary-disabled")).toBe(
    "ButtonFace",
  );
  expect(mapped.get("--native-color-on-button-link")).toBe("LinkText");
});

test("draws Windows's pressed hyperlink button in ActiveText, not on Highlight", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-on-button-link-pressed")).toBe(
    "ActiveText",
  );
});

test("edges Windows's buttons in ButtonText and keeps the standard button on ButtonFace under the pointer", () => {
  const mapped = new Map(declarations(forcedColors));

  for (const edge of [
    "button-primary-edge",
    "button-primary-edge-bottom",
    "button-secondary-edge-top",
    "button-secondary-edge-bottom",
  ]) {
    expect(mapped.get(`--native-color-${edge}`), edge).toBe("ButtonText");
  }
  expect(mapped.get("--native-color-button-secondary-hover")).toBe(
    "ButtonFace",
  );
  expect(mapped.get("--native-color-button-secondary-pressed")).toBe(
    "ButtonFace",
  );
  expect(mapped.get("--native-color-on-button-pressed")).toBe("CanvasText");
});

test("draws Windows's ContentDialog on Canvas with CanvasText edges", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-dialog-layer")).toBe("Canvas");
  expect(mapped.get("--native-color-dialog-edge")).toBe("CanvasText");
  expect(mapped.get("--native-color-dialog-band-edge")).toBe("CanvasText");
});

test("keeps Windows's indeterminate bar trackless under forced colours, as the contrast themes draw it", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.has("--native-color-progress-idle-track")).toBe(false);
  expect(mapped.get("--native-color-progress-fill")).toBe("Highlight");
});

test("sets Windows's SelectorBar text and its chosen pill in CanvasText", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.get("--native-color-on-tab")).toBe("CanvasText");
  expect(mapped.get("--native-color-on-tab-hover")).toBe("CanvasText");
  expect(mapped.get("--native-color-on-tab-disabled")).toBe("GrayText");
});

test("keeps the plain button's hover and pressed tints off Highlight, which would put CanvasText on it", () => {
  const mapped = new Map(declarations(forcedColors));

  expect(mapped.has("--native-color-button-plain-hover")).toBe(false);
  expect(mapped.has("--native-color-button-plain-pressed")).toBe(false);
});

test("is loaded by the app stylesheet after the generated tokens", () => {
  const imports = appCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("@import"));
  const generated = imports.findIndex((line) =>
    line.includes("./lib/theme/generated/index.css"),
  );
  const forced = imports.findIndex((line) =>
    line.includes("./lib/theme/forced-colors-windows.css"),
  );

  expect(generated).toBeGreaterThan(-1);
  expect(forced).toBeGreaterThan(generated);
});

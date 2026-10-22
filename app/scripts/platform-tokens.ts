import type { Platform } from "../src/lib/ipc/bindings.ts";
import { byCodePoint } from "../src/lib/licences/order.ts";
import {
  type Kind,
  parseTokenSource,
  type PlatformValue,
  type Token,
} from "./token-source.ts";

const TAILWIND_NAME = {
  color: "color-native",
  radius: "radius-native",
  spacing: "spacing-native",
  duration: "transition-duration",
  ease: "ease",
} satisfies Record<Kind, string>;

type Scope = "every" | "light" | "dark";

const SCOPES: readonly Scope[] = ["every", "light", "dark"];

const DEFAULT_SELECTOR = ":root,\n[data-theme]";

const REDUCED_MOTION_SELECTOR =
  "  :root,\n  :root[data-platform],\n  [data-theme],\n  :root[data-platform] [data-theme]";

function nativeName(token: Token): string {
  return `--native-${token.kind}-${token.name}`;
}

function declaration(token: Token, value: string, indent = "  "): string {
  return `${indent}${nativeName(token)}: ${value};`;
}

function block(selector: string, declarations: readonly string[]): string {
  return `${selector} {\n${declarations.join("\n")}\n}\n`;
}

function valueIn(value: PlatformValue, scope: Scope): string | undefined {
  if (!value.themed) {
    return scope === "every" ? value.value : undefined;
  }
  return scope === "every" ? undefined : value[scope];
}

function platformSelector(platform: Platform, scope: Scope): string {
  const root = `:root[data-platform="${platform}"]`;
  switch (scope) {
    case "every":
      return `${root},\n${root} [data-theme]`;
    case "light":
      return `${root},\n${root} [data-theme="light"]`;
    case "dark":
      return `${root}[data-theme="dark"],\n${root} [data-theme="dark"]`;
  }
}

function platformFile(tokens: readonly Token[], platform: Platform): string {
  const blocks = SCOPES.flatMap((scope) => {
    const declarations = tokens.flatMap((token) => {
      const value = token.platforms.get(platform);
      const scopedValue =
        value === undefined ? undefined : valueIn(value, scope);
      return scopedValue === undefined ? [] : [declaration(token, scopedValue)];
    });
    return declarations.length === 0
      ? []
      : [block(platformSelector(platform, scope), declarations)];
  });
  return blocks.join("\n");
}

function platformFileName(platform: Platform): string {
  return `tokens-${platform}.css`;
}

function indexFile(
  tokens: readonly Token[],
  platforms: readonly Platform[],
): string {
  const imports = ["tokens-default.css", ...platforms.map(platformFileName)]
    .map((file) => `@import "./${file}";`)
    .join("\n");
  const theme = block(
    "@theme inline",
    tokens.map(
      (token) =>
        `  --${TAILWIND_NAME[token.kind]}-${token.name}: var(${nativeName(token)});`,
    ),
  );
  const stilled = tokens.flatMap((token) =>
    token.reducedMotion === undefined
      ? []
      : [declaration(token, token.reducedMotion, "    ")],
  );
  const reducedMotion =
    stilled.length === 0
      ? []
      : [
          `@media (prefers-reduced-motion: reduce) {\n${REDUCED_MOTION_SELECTOR} {\n${stilled.join("\n")}\n  }\n}\n`,
        ];
  return [`${imports}\n`, theme, ...reducedMotion].join("\n");
}

export function renderPlatformTokens(
  source: unknown,
): ReadonlyMap<string, string> {
  const { tokens, platforms } = parseTokenSource(source);
  const files = new Map<string, string>([
    ["index.css", indexFile(tokens, platforms)],
    [
      "tokens-default.css",
      block(
        DEFAULT_SELECTOR,
        tokens.map((token) => declaration(token, token.defaultValue)),
      ),
    ],
    ...platforms.map(
      (platform) =>
        [platformFileName(platform), platformFile(tokens, platform)] as const,
    ),
  ]);
  return new Map([...files].sort(([a], [b]) => byCodePoint(a, b)));
}

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";

interface ScanSource {
  readonly base: string;
  readonly pattern: string;
  readonly negated: boolean;
}

interface OxideScanner {
  scan(): string[];
}

interface OxideModule {
  readonly Scanner: new (options: {
    sources: readonly ScanSource[];
  }) => OxideScanner;
}

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("../app.css", import.meta.url));
const ICON_LIBRARY_CLASSES_THAT_TAILWIND_NEVER_GENERATES =
  /^lucide(?:-[a-z0-9-]+)?$/;

let written: ReadonlySet<string> | undefined;

function isOxideModule(candidate: unknown): candidate is OxideModule {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "Scanner" in candidate &&
    typeof candidate.Scanner === "function"
  );
}

function loadOxide(): OxideModule {
  const require = createRequire(import.meta.url);
  const fromVitePlugin = createRequire(require.resolve("@tailwindcss/vite"));
  const loaded: unknown = fromVitePlugin("@tailwindcss/oxide");
  if (!isOxideModule(loaded)) {
    throw new Error("@tailwindcss/oxide does not export a Scanner");
  }
  return loaded;
}

export async function loadWrittenClasses(): Promise<void> {
  const tailwindStylesheet = fileURLToPath(
    import.meta.resolve("tailwindcss/index.css"),
  );
  const compiler = await compile(readFileSync(STYLESHEET, "utf8"), {
    base: fileURLToPath(new URL("../", import.meta.url)),
    loadStylesheet: (id, base) => {
      if (id !== "tailwindcss") {
        throw new Error(`unexpected stylesheet ${id}`);
      }
      return Promise.resolve({
        path: tailwindStylesheet,
        base,
        content: readFileSync(tailwindStylesheet, "utf8"),
      });
    },
  });
  const automatic: ScanSource[] =
    compiler.root === null
      ? [{ base: PROJECT_ROOT, pattern: "**/*", negated: false }]
      : compiler.root === "none"
        ? []
        : [{ ...compiler.root, negated: false }];
  const scanner = new (loadOxide().Scanner)({
    sources: [...automatic, ...compiler.sources],
  });
  written = new Set(scanner.scan());
}

export function isWrittenInSource(token: string): boolean {
  if (written === undefined) {
    throw new Error("loadWrittenClasses() has not run");
  }
  return written.has(token);
}

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
]);
const ENTITY = /&(?:quot|#39|lt|gt|amp);/g;
const START_OF_TAG = /<[a-zA-Z][^\s/>]*/y;
const ATTRIBUTE_NAME = /[^\s=>/]+/y;
const UNQUOTED_VALUE = /[^\s>]+/y;

function decoded(text: string): string {
  return text.replace(ENTITY, (entity) => ENTITIES.get(entity) ?? entity);
}

function matchAt(pattern: RegExp, text: string, index: number): string | null {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0] ?? null;
}

function skipSpace(text: string, index: number): number {
  let next = index;
  while (next < text.length && /\s/.test(text.charAt(next))) {
    next += 1;
  }
  return next;
}

function attributeValue(
  text: string,
  index: number,
): { value: string; end: number } {
  const quote = text.charAt(index);
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, index + 1);
    const end = close === -1 ? text.length : close;
    return { value: text.slice(index + 1, end), end: end + 1 };
  }
  const unquoted = matchAt(UNQUOTED_VALUE, text, index) ?? "";
  return { value: unquoted, end: index + unquoted.length };
}

export function renderedClasses(markup: string): string[] {
  const classes: string[] = [];
  let index = 0;
  while (index < markup.length) {
    if (markup.startsWith("<!--", index)) {
      const close = markup.indexOf("-->", index);
      index = close === -1 ? markup.length : close + 3;
      continue;
    }
    const tag = matchAt(START_OF_TAG, markup, index);
    if (tag === null) {
      index += 1;
      continue;
    }
    index = skipSpace(markup, index + tag.length);
    while (index < markup.length && !markup.startsWith(">", index)) {
      const name = matchAt(ATTRIBUTE_NAME, markup, index);
      if (name === null) {
        index = skipSpace(markup, index + 1);
        continue;
      }
      index = skipSpace(markup, index + name.length);
      if (markup.charAt(index) !== "=") {
        continue;
      }
      const { value, end } = attributeValue(
        markup,
        skipSpace(markup, index + 1),
      );
      index = skipSpace(markup, end);
      if (name === "class") {
        classes.push(
          ...decoded(value)
            .split(/\s+/)
            .filter((token) => token !== ""),
        );
      }
    }
  }
  return classes;
}

export function unwrittenClasses(markup: string): string[] {
  return [...new Set(renderedClasses(markup))].filter(
    (token) =>
      !ICON_LIBRARY_CLASSES_THAT_TAILWIND_NEVER_GENERATES.test(token) &&
      !isWrittenInSource(token),
  );
}

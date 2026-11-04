import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { CONSUMER_CLASS, html, renderPage } from "#lib/components/ui/render.ts";
import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
import { bypassesRenderPage } from "#lib/render-bypass.ts";
import {
  isWrittenInSource,
  renderedClasses,
  unwrittenClasses,
} from "#lib/tailwind-source.ts";

const SRC = new URL("../", import.meta.url);
const SERVER_RENDERER = ["svelte", "server"].join("/");
const INTERNAL_SERVER_RENDERER = ["svelte", "internal", "server"].join("/");
const RENDER_HELPER = "lib/components/ui/render.ts";
const SCANNED_FOR_BYPASS = /\.(?:ts|svelte)$/;

test("finds a class that a source file writes in full", () => {
  expect(isWrittenInSource(CONSUMER_CLASS)).toBe(true);
});

test("does not take a part of a longer class for the class", () => {
  expect(isWrittenInSource(CONSUMER_CLASS.slice(0, -1))).toBe(false);
  expect(isWrittenInSource(CONSUMER_CLASS.slice(1))).toBe(false);
});

test("does not find a class that only a test file writes", () => {
  expect(isWrittenInSource("only-this-test-file-writes-it")).toBe(false);
});

test("does not find a class that source builds from a value", () => {
  expect(isWrittenInSource("tablet:w-[40%]")).toBe(false);
});

test("reads the classes of every class attribute, double, single or unquoted", () => {
  const markup =
    "<div class=\"a  b\"><svg class='c'></svg><i class=d></i></div>";

  expect(renderedClasses(markup)).toEqual(["a", "b", "c", "d"]);
});

test("reads a class attribute that follows attributes with a greater-than sign in their value", () => {
  const markup = '<div data-x="a>b" title=\'c>d\' class="e f" hidden>';

  expect(renderedClasses(markup)).toEqual(["e", "f"]);
});

test("reads a class attribute of a self-closing tag", () => {
  expect(renderedClasses('<input type="text" class="g" />')).toEqual(["g"]);
});

test("does not read a class attribute that only appears as escaped text", () => {
  const markup = '<p>&lt;div class="evil"&gt;</p><i class="real"></i>';

  expect(renderedClasses(markup)).toEqual(["real"]);
});

test("does not let text that contains class and a quote swallow the next attribute", () => {
  const markup = '<p>use class="a</p><i class="real"></i>';

  expect(renderedClasses(markup)).toEqual(["real"]);
});

test("does not read a class attribute inside a comment", () => {
  const markup = '<!-- class="hidden" --><i class="shown"></i>';

  expect(renderedClasses(markup)).toEqual(["shown"]);
});

test("decodes the entities of a class value before it splits the classes", () => {
  const markup = '<div class="[&amp;>svg]:size-4 a&quot;b c&#39;d &lt;e&gt;">';

  expect(renderedClasses(markup)).toEqual([
    "[&>svg]:size-4",
    'a"b',
    "c'd",
    "<e>",
  ]);
});

test("lists each rendered class that no source file writes once", () => {
  const markup = '<p class="tablet:w-[40%] hover:bg-chip tablet:w-[40%]">';

  expect(unwrittenClasses(markup)).toEqual(["tablet:w-[40%]"]);
});

test("lets the classes of the icon library through", () => {
  const markup = '<svg class="lucide lucide-eye block-4">';

  expect(unwrittenClasses(markup)).toEqual([]);
});

test("fails a render that carries a class no source file writes, naming the component, the test and the class", () => {
  expect(() => html(Skeleton, { class: "w-[41%]" })).toThrow(
    /Skeleton rendered in "fails a render that carries a class.*w-\[41%\]/,
  );
});

test("tells how to treat a class that only a safelist generates", () => {
  expect(() => html(Skeleton, { class: "w-[41%]" })).toThrow(/@source inline/);
});

test("fails only for the state that carries the unwritten class", () => {
  expect(unwrittenClasses(renderPage(Skeleton, {}).body)).toEqual([]);
  expect(() => renderPage(Skeleton, { class: "w-[41%]" })).toThrow(/w-\[41%\]/);
});

test.each([
  ["a static import", `import { render } from "${SERVER_RENDERER}";`],
  [
    "a dynamic import",
    `const { render } = await import("${SERVER_RENDERER}");`,
  ],
  ["an import of the internal server", `import "${INTERNAL_SERVER_RENDERER}";`],
  ["a single quoted import", `import { render } from '${SERVER_RENDERER}';`],
])("finds %s of the server renderer", (_name, source) => {
  expect(bypassesRenderPage(source)).toBe(true);
});

test.each([
  'import { render } from "svelte";',
  'import { mount } from "svelte/client";',
  "const note = `render on the server`;",
])("lets %s through", (source) => {
  expect(bypassesRenderPage(source)).toBe(false);
});

test("keeps every file but the render helper off the server renderer, so no test and no helper skips the class check", () => {
  const offenders = readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((name) => SCANNED_FOR_BYPASS.test(name) && name !== RENDER_HELPER)
    .filter((name) =>
      bypassesRenderPage(readFileSync(new URL(name, SRC), "utf8")),
    );

  expect(
    offenders,
    "render through renderPage in lib/components/ui/render.ts, which checks every rendered class",
  ).toEqual([]);
});

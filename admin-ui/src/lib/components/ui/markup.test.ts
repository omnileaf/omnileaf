import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";

const SRC = new URL("../../../", import.meta.url);
const INLINE_STYLE = /<style\b|\sstyle[=:{]/;
const UNDEFINED_WIDTH_VARIANT = /(?:^|[\s"'`])(?:sm|md|lg|xl|2xl):[a-z]/;

interface Source {
  readonly name: string;
  readonly text: string;
}

function sources(isWanted: (name: string) => boolean): Source[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter(isWanted)
    .map((name) => ({
      name,
      text: readFileSync(new URL(name, SRC), { encoding: "utf8" }),
    }));
}

const markup = sources(
  (name) => name.endsWith(".svelte") || name === "app.html",
);
const componentClasses = sources(
  (name) =>
    name.startsWith("lib/components/") &&
    /\.(svelte|ts)$/.test(name) &&
    !name.endsWith(".test.ts"),
);

test("keeps inline styles out of every svelte file and the html shell", () => {
  const offenders = markup
    .filter(({ text }) => INLINE_STYLE.test(text))
    .map(({ name }) => name);

  expect(offenders).toEqual([]);
});

test("checks the shell and the component files it scans", () => {
  const names = markup.map(({ name }) => name);

  expect(names).toContain("app.html");
  expect(names).toContain("lib/components/ui/button/button.svelte");
  expect(names).toContain("routes/+page.svelte");
});

test("sizes components with the tablet variant only", () => {
  const offenders = componentClasses
    .filter(({ text }) => UNDEFINED_WIDTH_VARIANT.test(text))
    .map(({ name }) => name);

  expect(offenders).toEqual([]);
  expect(componentClasses.length).toBeGreaterThan(0);
});

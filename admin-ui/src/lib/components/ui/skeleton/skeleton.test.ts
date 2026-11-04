import { expect, test } from "vitest";

import { html, tokensOf, CONSUMER_CLASS } from "#lib/components/ui/render.ts";

import { Skeleton } from "./index.ts";

const BLOCK = /<div\b[^>]*>/;

test("hides a loading placeholder from assistive technology", () => {
  expect(html(Skeleton, {})).toContain('aria-hidden="true"');
});

test("draws a chip coloured block and pulses only for people who allow motion", () => {
  expect(tokensOf(html(Skeleton, {}), BLOCK)).toEqual(
    expect.arrayContaining([
      "bg-chip",
      "rounded-control",
      "motion-safe:animate-pulse",
    ]),
  );
});

test("lets the consumer class size the block and come last", () => {
  const tokens = tokensOf(
    html(Skeleton, { class: `block-4 ${CONSUMER_CLASS}` }),
    BLOCK,
  );

  expect(tokens).toContain("block-4");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

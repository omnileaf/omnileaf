import { expect, test } from "vitest";

import {
  expectOwnLook,
  html,
  tokensOf,
  words,
  CONSUMER_CLASS,
} from "#lib/components/ui/render.ts";

import { Badge, type BadgeVariant } from "./index.ts";

const BADGE = /<span\b[^>]*>/;

const VARIANT_LOOKS = {
  solid: ["border-transparent", "bg-accent", "text-on-accent"],
  soft: ["border-transparent", "bg-accent-soft", "text-accent-ink"],
  outline: ["border-accent", "text-accent-ink"],
  chip: ["border-transparent", "bg-chip", "text-muted"],
  "muted-outline": ["border-border", "text-muted"],
} satisfies Record<BadgeVariant, readonly string[]>;

const VARIANTS = ["solid", "soft", "outline", "chip", "muted-outline"] as const;

const SHAPE = [
  "inline-flex",
  "block-6",
  "inline-fit",
  "rounded-full",
  "border",
  "px-2.5",
  "text-badge",
  "font-semibold",
];

test.each(VARIANTS)(
  "gives the %s badge its own look and no other",
  (variant) => {
    const markup = html(Badge, { variant, children: words("New") });

    expectOwnLook(VARIANT_LOOKS, variant, tokensOf(markup, BADGE));
  },
);

test.each(VARIANTS)(
  "draws the %s badge 24px tall with 12.5px semibold text in a pill",
  (variant) => {
    const markup = html(Badge, { variant, children: words("New") });

    expect(tokensOf(markup, BADGE)).toEqual(expect.arrayContaining(SHAPE));
  },
);

test("lets the consumer class come last", () => {
  const markup = html(Badge, { class: CONSUMER_CLASS, children: words("New") });

  expect(tokensOf(markup, BADGE).at(-1)).toBe(CONSUMER_CLASS);
});

test("forwards native attributes to the badge", () => {
  const markup = html(Badge, { id: "tag", children: words("New") });

  expect(markup).toContain('id="tag"');
});

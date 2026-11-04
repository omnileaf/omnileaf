import { expect, test } from "vitest";

import {
  expectOwnLook,
  html,
  tokensOf,
  words,
  CONSUMER_CLASS,
} from "#lib/components/ui/render.ts";

import { buttonLook } from "./variants.ts";
import {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./index.ts";

const BUTTON = /<button\b[^>]*>/;

const VARIANT_LOOKS = {
  default: ["bg-accent", "text-on-accent", "hover:bg-accent/90"],
  secondary: ["bg-chip", "text-foreground", "hover:bg-border"],
  outline: [
    "border",
    "border-field-edge",
    "bg-card",
    "text-foreground",
    "hover:bg-well",
  ],
  ghost: ["text-foreground", "hover:bg-chip"],
} as const satisfies Record<ButtonVariant, readonly string[]>;

const SIZE_LOOKS = {
  sm: ["block-11", "px-3", "tablet:block-8"],
  default: ["block-11", "px-4", "tablet:block-9"],
  lg: ["block-12", "px-6", "tablet:block-11"],
  icon: ["block-11", "inline-11", "tablet:block-9", "tablet:inline-9"],
} as const satisfies Record<ButtonSize, readonly string[]>;

function render(props: ButtonProps = {}): string {
  return html(Button, { ...props, children: words("Save") });
}

test.each(["default", "secondary", "outline", "ghost"] as const)(
  "gives the %s button its own look and no other",
  (variant) => {
    expectOwnLook(
      VARIANT_LOOKS,
      variant,
      tokensOf(render({ variant }), BUTTON),
    );
  },
);

test.each(["sm", "default", "lg"] as const)(
  "sizes the %s button for a phone and for the tablet width",
  (size) => {
    expectOwnLook(SIZE_LOOKS, size, tokensOf(render({ size }), BUTTON));
  },
);

test("sizes the icon button as a square for a phone and for the tablet width", () => {
  const markup = render({ size: "icon", "aria-label": "Close" });

  expectOwnLook(SIZE_LOOKS, "icon", tokensOf(markup, BUTTON));
});

test("rings a focused button with a 2px accent outline offset by 2px", () => {
  expect(tokensOf(render(), BUTTON)).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-accent",
    ]),
  );
});

test("lets the consumer class win and come last", () => {
  const tokens = tokensOf(
    render({ class: `bg-card ${CONSUMER_CLASS}` }),
    BUTTON,
  );

  expect(tokens).toContain("bg-card");
  expect(tokens).not.toContain("bg-accent");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

test("never submits a form unless asked", () => {
  expect(render()).toContain('type="button"');
  expect(render({ type: "submit" })).toContain('type="submit"');
});

test("forwards native attributes to the button", () => {
  const markup = render({
    id: "save",
    disabled: true,
    "aria-label": "Save it",
  });

  expect(markup).toContain('id="save"');
  expect(markup).toContain('aria-label="Save it"');
  expect(markup).toMatch(/<button\b[^>]*\sdisabled/);
});

test("gives a link the look of a button of the same variant and size", () => {
  const tokens = buttonLook("outline", "sm").split(" ");

  expectOwnLook(VARIANT_LOOKS, "outline", tokens);
  expectOwnLook(SIZE_LOOKS, "sm", tokens);
  expect(tokens).toContain("inline-flex");
});

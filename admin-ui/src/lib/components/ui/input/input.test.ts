import { expect, test } from "vitest";

import { html, tokensOf, CONSUMER_CLASS } from "#lib/components/ui/render.ts";

import { Input } from "./index.ts";

const INPUT = /<input\b[^>]*>/;

test("makes an input 44px tall on a phone and 36px from the tablet width up", () => {
  expect(tokensOf(html(Input, {}), INPUT)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
});

test("keeps input text at 16px on a phone so the browser does not zoom in", () => {
  expect(tokensOf(html(Input, {}), INPUT)).toEqual(
    expect.arrayContaining(["text-body", "tablet:text-small"]),
  );
});

test("draws the field edge in the 3:1 token on a card background", () => {
  expect(tokensOf(html(Input, {}), INPUT)).toEqual(
    expect.arrayContaining([
      "border",
      "border-field-edge",
      "bg-card",
      "rounded-control",
      "inline-full",
    ]),
  );
});

test("rings a focused input with a 2px accent outline offset by 2px", () => {
  expect(tokensOf(html(Input, {}), INPUT)).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-accent",
    ]),
  );
});

test("lets the consumer class win and come last", () => {
  const tokens = tokensOf(
    html(Input, { class: `rounded-card ${CONSUMER_CLASS}` }),
    INPUT,
  );

  expect(tokens).toContain("rounded-card");
  expect(tokens).not.toContain("rounded-control");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

test("forwards native attributes to the input", () => {
  const markup = html(Input, {
    id: "search",
    name: "q",
    type: "search",
    placeholder: "Search reports",
    "aria-describedby": "search-hint",
    "aria-invalid": true,
    disabled: true,
  });

  expect(markup).toContain('id="search"');
  expect(markup).toContain('name="q"');
  expect(markup).toContain('type="search"');
  expect(markup).toContain('placeholder="Search reports"');
  expect(markup).toContain('aria-describedby="search-hint"');
  expect(markup).toContain('aria-invalid="true"');
  expect(markup).toMatch(/<input\b[^>]*\sdisabled/);
});

test("shows the value it is given", () => {
  expect(html(Input, { value: "R-1111-1111" })).toContain(
    'value="R-1111-1111"',
  );
});

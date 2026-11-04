import { expect, test } from "vitest";

import { html, tokensOf, CONSUMER_CLASS } from "#lib/components/ui/render.ts";

import { Textarea } from "./index.ts";

const TEXTAREA = /<textarea\b[^>]*>/;

test("draws a textarea like an input but taller than one line", () => {
  const tokens = tokensOf(html(Textarea, {}), TEXTAREA);

  expect(tokens).toEqual(
    expect.arrayContaining([
      "min-block-24",
      "border-field-edge",
      "rounded-control",
      "text-body",
      "tablet:text-small",
      "focus-visible:outline-accent",
    ]),
  );
  expect(tokens).not.toContain("block-11");
});

test("lets the consumer class win and come last", () => {
  const tokens = tokensOf(
    html(Textarea, { class: `rounded-card ${CONSUMER_CLASS}` }),
    TEXTAREA,
  );

  expect(tokens).toContain("rounded-card");
  expect(tokens).not.toContain("rounded-control");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

test("forwards native attributes to the textarea", () => {
  const markup = html(Textarea, {
    id: "note",
    name: "note",
    rows: 4,
    placeholder: "Add a note",
    "aria-describedby": "note-hint",
  });

  expect(markup).toContain('id="note"');
  expect(markup).toContain('name="note"');
  expect(markup).toContain('rows="4"');
  expect(markup).toContain('placeholder="Add a note"');
  expect(markup).toContain('aria-describedby="note-hint"');
});

test("shows the value it is given", () => {
  expect(html(Textarea, { value: "Looks fine" })).toContain(">Looks fine<");
});

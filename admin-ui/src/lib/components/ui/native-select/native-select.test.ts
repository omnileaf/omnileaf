import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";

import NativeSelectHarness from "./NativeSelectHarness.svelte";
import { NativeSelect } from "./index.ts";

const SELECT = /<select\b[^>]*>/;
const WRAPPER = /<div\b[^>]*data-slot="native-select-wrapper"[^>]*>/;
const CHEVRON = /<svg\b[^>]*>/;

function render(props: { class?: string; fieldClass?: string } = {}): string {
  return html(NativeSelect, { ...props, children: words("") });
}

test("keeps the native select element", () => {
  const markup = render();

  expect(markup).toContain("<select");
  expect(tokensOf(markup, SELECT)).toContain("appearance-none");
});

test("makes a select as tall as an input", () => {
  expect(tokensOf(render(), SELECT)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
});

test("shares the field edge, text size and focus ring with the input", () => {
  expect(tokensOf(render(), SELECT)).toEqual(
    expect.arrayContaining([
      "border-field-edge",
      "rounded-control",
      "text-body",
      "tablet:text-small",
      "focus-visible:outline-2",
      "focus-visible:outline-accent",
    ]),
  );
});

test("leaves room for the chevron at the end of the select", () => {
  expect(tokensOf(render(), SELECT)).toContain("pe-10");
});

test("draws a chevron that lets clicks through to the select", () => {
  const tokens = tokensOf(render(), CHEVRON);

  expect(tokens).toEqual(
    expect.arrayContaining([
      "lucide-chevron-down",
      "pointer-events-none",
      "absolute",
      "inset-e-3",
    ]),
  );
});

test("puts the consumer class on the wrapper so it sizes the whole control", () => {
  const markup = render({ class: "inline-48" });

  expect(tokensOf(markup, WRAPPER)).toContain("inline-48");
  expect(tokensOf(markup, SELECT)).not.toContain("inline-48");
});

test("puts the field class on the select itself", () => {
  const markup = render({ fieldClass: "rounded-card extra" });
  const tokens = tokensOf(markup, SELECT);

  expect(tokens).toContain("rounded-card");
  expect(tokens).not.toContain("rounded-control");
  expect(tokens.at(-1)).toBe("extra");
  expect(tokensOf(markup, WRAPPER)).not.toContain("extra");
});

test("selects the option that matches the value it is given", () => {
  const markup = html(NativeSelectHarness, { value: "closed" });

  expect(markup).toMatch(/<option\b[^>]*value="closed"[^>]*selected/);
  expect(markup).not.toMatch(/<option\b[^>]*value="reviewing"[^>]*selected/);
});

test("forwards native attributes to the select", () => {
  expect(html(NativeSelectHarness, { value: "closed" })).toMatch(
    /<select\b[^>]*id="status"/,
  );
});

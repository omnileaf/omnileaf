import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";

import { Separator } from "./index.ts";

test("draws a horizontal separator as a native rule one pixel tall", () => {
  const markup = html(Separator, {});

  expect(markup).toContain("<hr");
  expect(markup).not.toContain("<div");
  expect(markup).not.toContain("role=");
  expect(tokensOf(markup, /<hr\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "block-px",
      "inline-full",
      "bg-border",
      "border-0",
    ]),
  );
});

test("hides a decorative horizontal separator from assistive technology", () => {
  const markup = html(Separator, { decorative: true });

  expect(markup).toContain("<hr");
  expect(markup).toContain('role="none"');
});

test("announces a vertical separator one pixel wide", () => {
  const markup = html(Separator, { orientation: "vertical" });

  expect(markup).toContain("<div");
  expect(markup).toContain('role="separator"');
  expect(markup).toContain('aria-orientation="vertical"');
  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining(["inline-px", "min-block-full", "bg-border"]),
  );
});

test("hides a decorative vertical separator from assistive technology", () => {
  const markup = html(Separator, { orientation: "vertical", decorative: true });

  expect(markup).toContain('role="none"');
  expect(markup).not.toContain("aria-orientation");
});

test("lets the consumer class come last", () => {
  const markup = html(Separator, { class: "extra" });

  expect(tokensOf(markup, /<hr\b[^>]*>/).at(-1)).toBe("extra");
});

import Info from "@lucide/svelte/icons/info";
import { expect, test } from "vitest";

import {
  html,
  tokensOf,
  words,
  CONSUMER_CLASS,
} from "#lib/components/ui/render.ts";

import { Alert, AlertDescription, AlertTitle } from "./index.ts";

const BOX = /<div\b[^>]*data-slot="alert"[^>]*>/;

test("interrupts assistive technology with an alert by default", () => {
  const markup = html(Alert, { icon: Info, children: words("Hello") });

  expect(markup).toContain('role="alert"');
  expect(markup).not.toContain('role="status"');
});

test("speaks politely when asked for a status", () => {
  const markup = html(Alert, {
    icon: Info,
    role: "status",
    children: words("Hello"),
  });

  expect(markup).toContain('role="status"');
  expect(markup).not.toContain('role="alert"');
});

test("draws a neutral bordered box and keeps it out of red", () => {
  const tokens = tokensOf(
    html(Alert, { icon: Info, children: words("Hello") }),
    BOX,
  );

  expect(tokens).toEqual(
    expect.arrayContaining([
      "border",
      "border-border",
      "bg-card",
      "text-foreground",
      "rounded-control",
    ]),
  );
  expect(tokens.join(" ")).not.toMatch(/danger|red|destructive/);
});

test("draws the icon it is given in the accent ink beside the words", () => {
  const markup = html(Alert, { icon: Info, children: words("Hello") });

  expect(tokensOf(markup, /<svg\b[^>]*>/)).toEqual(
    expect.arrayContaining(["lucide-info", "text-accent-ink", "shrink-0"]),
  );
  expect(markup).toContain("Hello");
});

test("lets the consumer class win and come last", () => {
  const markup = html(Alert, {
    icon: Info,
    class: `bg-well ${CONSUMER_CLASS}`,
  });
  const tokens = tokensOf(markup, BOX);

  expect(tokens).toContain("bg-well");
  expect(tokens).not.toContain("bg-card");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

test("sets the title in semibold and the description in muted text", () => {
  const title = html(AlertTitle, { children: words("Move refused") });
  const description = html(AlertDescription, { children: words("Try again") });

  expect(tokensOf(title, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "font-semibold"]),
  );
  expect(tokensOf(description, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "text-muted"]),
  );
});

import Inbox from "@lucide/svelte/icons/inbox";
import { expect, test } from "vitest";

import {
  html,
  tokensOf,
  words,
  CONSUMER_CLASS,
} from "#lib/components/ui/render.ts";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "./index.ts";

test("draws an empty state as a centred dashed box in the card radius", () => {
  const markup = html(Empty, { children: words("") });

  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "flex",
      "flex-col",
      "items-center",
      "text-center",
      "rounded-card",
      "border",
      "border-dashed",
      "border-border",
      "p-8",
    ]),
  );
});

test("lets the consumer class win and come last", () => {
  const tokens = tokensOf(
    html(Empty, { class: `p-4 ${CONSUMER_CLASS}` }),
    /<div\b[^>]*>/,
  );

  expect(tokens).toContain("p-4");
  expect(tokens).not.toContain("p-8");
  expect(tokens.at(-1)).toBe(CONSUMER_CLASS);
});

test("shows the icon it is given in a round accent badge", () => {
  const markup = html(EmptyMedia, { icon: Inbox });

  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "rounded-full",
      "bg-accent-soft",
      "text-accent-ink",
      "block-12",
      "inline-12",
    ]),
  );
  expect(tokensOf(markup, /<svg\b[^>]*>/)).toEqual(
    expect.arrayContaining(["lucide-inbox", "block-6", "inline-6"]),
  );
});

test("titles an empty state with a second level heading unless told otherwise", () => {
  const markup = html(EmptyTitle, { children: words("No reports") });

  expect(markup).toContain("<h2");
  expect(tokensOf(markup, /<h2\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-lead", "font-semibold"]),
  );
});

test("titles an empty state with the heading level it is given", () => {
  const markup = html(EmptyTitle, { level: 3, children: words("No reports") });

  expect(markup).toContain("<h3");
  expect(markup).not.toContain("<h2");
});

test("sets the description in small muted text", () => {
  const markup = html(EmptyDescription, { children: words("Nothing yet") });

  expect(tokensOf(markup, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "text-muted"]),
  );
});

test("keeps the action in a centred wrapping row", () => {
  const markup = html(EmptyContent, { children: words("Clear filters") });

  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "flex",
      "flex-wrap",
      "items-center",
      "justify-center",
      "gap-2",
    ]),
  );
  expect(markup).toContain("Clear filters");
});

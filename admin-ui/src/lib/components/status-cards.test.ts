import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import { STATUS_KINDS, type StatusKind } from "#lib/wire.ts";

import StatusCards from "./status-cards.svelte";

const COUNTS: Record<StatusKind, number> = {
  received: 3,
  reviewing: 12,
  published: 0,
  duplicate: 1,
  closed: 7,
};
const LINK = /<a\b[^>]*>/g;

function cards(): { link: string; text: string }[] {
  const markup = html(StatusCards, { counts: COUNTS });
  return [...markup.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)].map(
    ([, link = "", inner = ""]) => ({
      link,
      text: inner.replace(/<!--.*?-->/gs, "").replace(/<[^>]*>/g, " "),
    }),
  );
}

test("links one card per status in order to the reports of that status", () => {
  const hrefs = cards().map(({ link }) => /href="([^"]*)"/.exec(link)?.[1]);

  expect(hrefs).toEqual(
    STATUS_KINDS.map((kind) => `/admin/reports?status=${kind}`),
  );
});

test("names each card by status, count and note", () => {
  const texts = cards().map(({ text }) => text.replace(/\s+/g, " ").trim());

  expect(texts).toEqual([
    "Received 3 Waiting for review",
    "Reviewing 12 In progress",
    "Published 0 Issue opened",
    "Duplicate 1 Matches an issue",
    "Closed 7 No action",
  ]);
});

test("lists the cards", () => {
  const markup = html(StatusCards, { counts: COUNTS });

  expect(markup.match(/<li\b/g)).toHaveLength(STATUS_KINDS.length);
  expect(markup).toMatch(/<ul\b/);
});

test("gives only the received card the attention treatment", () => {
  const markup = html(StatusCards, { counts: COUNTS });
  const cardTokens = [
    ...markup.matchAll(/<div\b[^>]*data-slot="card"[^>]*>/g),
  ].map(([tag = ""]) => tokensOf(tag, /<div\b[^>]*>/));

  expect(cardTokens[0]).toContain("border-accent");
  for (const tokens of cardTokens.slice(1)) {
    expect(tokens).not.toContain("border-accent");
  }
  expect(markup.match(/text-accent-ink/g)).toHaveLength(1);
});

test("sets the count large in tabular figures", () => {
  const markup = html(StatusCards, { counts: COUNTS });

  expect(tokensOf(markup, /<span\b[^>]*text-heading[^>]*>/)).toEqual(
    expect.arrayContaining(["text-heading", "tabular-nums", "font-semibold"]),
  );
});

test("rings a focused card and keeps the card out of the link", () => {
  const link = tokensOf(cards()[0]?.link ?? "", LINK);

  expect(link).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:outline-accent",
    ]),
  );
  expect(copy.status.received).toBe("Received");
});

test("never emits an inline style", () => {
  expect(html(StatusCards, { counts: COUNTS })).not.toMatch(/\sstyle=/);
});

test("draws a hidden icon of its own on each card next to the status word", () => {
  const markup = html(StatusCards, { counts: COUNTS });
  const icons = [...markup.matchAll(/<svg\b[^>]*>/g)].map(([tag = ""]) => tag);

  expect(icons).toHaveLength(STATUS_KINDS.length);
  for (const icon of icons) {
    expect(icon).toContain('aria-hidden="true"');
  }
  for (const icon of icons) {
    expect(tokensOf(icon, /<svg\b[^>]*>/)).toEqual(
      expect.arrayContaining(["block-3.5", "inline-3.5"]),
    );
  }
  expect(icons.map((icon) => /lucide-([a-z-]+)/.exec(icon)?.[1])).toEqual([
    "circle-dot",
    "clock",
    "check",
    "copy",
    "circle-minus",
  ]);
});

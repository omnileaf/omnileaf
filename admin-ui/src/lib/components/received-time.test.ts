import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";

import ReceivedTime from "./received-time.svelte";

const BOARD_MOMENT = 1_740_828_300;

test("writes the moment in UTC as the text of a time element", () => {
  const markup = html(ReceivedTime, { at: BOARD_MOMENT });

  expect(markup).toMatch(/<time\b[^>]*>2025-03-01 11:25 UTC<\/time>/);
});

test("carries the machine readable moment", () => {
  const markup = html(ReceivedTime, { at: BOARD_MOMENT });

  expect(markup).toContain('datetime="2025-03-01T11:25:00.000Z"');
});

test("keeps digits the same width so a column lines up", () => {
  expect(
    tokensOf(html(ReceivedTime, { at: BOARD_MOMENT }), /<time\b[^>]*>/),
  ).toContain("tabular-nums");
});

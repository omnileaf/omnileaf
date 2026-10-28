import { Compass } from "@lucide/svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { followCorePlatform } from "./platform.ts";

import EmptyState from "./EmptyState.svelte";

interface EmptyStateSpacing {
  readonly titleLineHeight: string;
  readonly bodyMaxWidth: string;
  readonly bodyLineHeight: string;
}

async function emptyStateSpacingOn(
  platform: Platform,
): Promise<EmptyStateSpacing> {
  followCorePlatform(platform);
  const screen = await render(EmptyState, {
    icon: Compass,
    title: "Your library is empty",
    body: "Add a folder of comics, manga or books to start reading.",
  });
  const title = getComputedStyle(
    screen.getByRole("heading", { level: 2 }).element(),
  );
  const body = getComputedStyle(
    screen.getByText("Add a folder", { exact: false }).element(),
  );
  return {
    titleLineHeight: title.lineHeight,
    bodyMaxWidth: body.maxInlineSize,
    bodyLineHeight: body.lineHeight,
  };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("spaces linux's empty state as shadcn's empty, with a 28px title line and a relaxed 384px description", async () => {
  expect(await emptyStateSpacingOn("linux")).toEqual({
    titleLineHeight: "28px",
    bodyMaxWidth: "384px",
    bodyLineHeight: "22.75px",
  });
});

test("keeps the empty state's spacing as it was on macos", async () => {
  expect(await emptyStateSpacingOn("macos")).toEqual({
    titleLineHeight: "24px",
    bodyMaxWidth: "440px",
    bodyLineHeight: "20px",
  });
});

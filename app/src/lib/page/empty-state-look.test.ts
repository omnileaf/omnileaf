import { Compass } from "@lucide/svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio";

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
  delete document.documentElement.dataset.theme;
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

async function windowsEmptyState(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("windows");
  const screen = await render(EmptyState, {
    icon: Compass,
    title: "Your library is empty",
    body: "Add a folder of comics, manga or books to start reading.",
  });
  return {
    title: screen.getByRole("heading", { level: 2 }).element(),
    body: screen.getByText("Add a folder", { exact: false }).element(),
  };
}

function inkOnThePage(element: Element): number {
  const probe = document.createElement("div");
  probe.style.backgroundColor = "var(--background)";
  probe.style.color = getComputedStyle(element).color;
  document.body.append(probe);
  return drawnContrast(probe);
}

test("sets Windows's empty state as a 20 over 28 semibold Subtitle above a 14 over 20 Body", async () => {
  const { title, body } = await windowsEmptyState("light");
  const [titleStyle, bodyStyle] = [title, body].map((element) =>
    getComputedStyle(element),
  );

  expect([
    titleStyle?.fontSize,
    titleStyle?.lineHeight,
    titleStyle?.fontWeight,
    bodyStyle?.fontSize,
    bodyStyle?.lineHeight,
    bodyStyle?.fontWeight,
  ]).toEqual(["20px", "28px", "600", "14px", "20px", "400"]);
});

for (const theme of ["light", "dark"] as const) {
  test(`reads the empty state's title and body at 4.5 to 1 in the ${theme} theme`, async () => {
    const { title, body } = await windowsEmptyState(theme);

    expect(inkOnThePage(title)).toBeGreaterThanOrEqual(4.5);
    expect(inkOnThePage(body)).toBeGreaterThanOrEqual(4.5);
  });
}

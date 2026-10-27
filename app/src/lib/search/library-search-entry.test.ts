import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import LibrarySearchEntry from "./LibrarySearchEntry.svelte";

interface FieldLook {
  readonly platform: Platform;
  readonly corner: string;
  readonly height: number;
  readonly fill: string;
  readonly edge: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;

const LOOKS: readonly FieldLook[] = [
  {
    platform: "linux",
    corner: "8px",
    height: 36,
    fill: "transparent",
    edge: "--input",
  },
  {
    platform: "android",
    corner: "9999px",
    height: 36,
    fill: "--android-container-high",
    edge: "transparent",
  },
  {
    platform: "ios",
    corner: "10px",
    height: 36,
    fill: "--ios-fill",
    edge: "transparent",
  },
  {
    platform: "macos",
    corner: "6px",
    height: 28,
    fill: "transparent",
    edge: "--input",
  },
  {
    platform: "windows",
    corner: "4px",
    height: 32,
    fill: "--windows-control",
    edge: "--windows-stroke",
  },
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws the library search field the ${look.platform} way`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(LibrarySearchEntry, { platform: look.platform });

    const field = page
      .getByRole("searchbox", { name: "Search the library" })
      .element().parentElement;
    if (field === null) {
      throw new Error("the search box sits in no field");
    }
    const style = getComputedStyle(field);

    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(field.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.backgroundColor).toBe(
      resolvedColour(look.fill, "backgroundColor"),
    );
    expect(style.borderTopColor).toBe(resolvedColour(look.edge, "color"));
  });
}

test("fills the field faintly in the dark theme, as shadcn does", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "dark";
  await render(LibrarySearchEntry, { platform: "linux" });

  const field = page
    .getByRole("searchbox", { name: "Search the library" })
    .element().parentElement;

  expect(field && getComputedStyle(field).backgroundColor).toBe(
    resolvedColour(
      "color-mix(in oklch, oklch(1 0 0 / 15%) 30%, transparent)",
      "backgroundColor",
    ),
  );
});

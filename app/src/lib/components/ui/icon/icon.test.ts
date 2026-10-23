import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Icon from "./icon.svelte";

interface PlatformIcon {
  readonly platform: Platform;
  readonly artwork: string;
  readonly filledArtwork: string;
  readonly size: string;
}

const PLATFORM_ICONS: readonly PlatformIcon[] = [
  {
    platform: "ios",
    artwork: "framework7/rectangle_stack.svg",
    filledArtwork: "framework7/rectangle_stack_fill.svg",
    size: "22px",
  },
  {
    platform: "android",
    artwork: "material-symbols/library_books.svg",
    filledArtwork: "material-symbols/library_books-fill.svg",
    size: "24px",
  },
  {
    platform: "linux",
    artwork: "lucide/library.svg",
    filledArtwork: "lucide/library.svg",
    size: "20px",
  },
  {
    platform: "macos",
    artwork: "lucide/library.svg",
    filledArtwork: "lucide/library.svg",
    size: "20px",
  },
  {
    platform: "windows",
    artwork: "lucide/library.svg",
    filledArtwork: "lucide/library.svg",
    size: "20px",
  },
];

function maskOf(element: Element): string {
  return getComputedStyle(element).maskImage;
}

test("stays out of what a screen reader reads", async () => {
  const { container } = await render(Icon, { name: "library" });

  const icon = container.querySelector("[data-icon]");

  expect(icon?.getAttribute("aria-hidden")).toBe("true");
});

for (const look of PLATFORM_ICONS) {
  test(`draws the library icon in ${look.platform}'s own artwork and size`, async () => {
    followCorePlatform(look.platform);
    const { container } = await render(Icon, { name: "library" });

    const icon = container.querySelector("[data-icon]");

    expect(icon).not.toBeNull();
    expect(maskOf(icon ?? document.body)).toContain(look.artwork);
    expect(getComputedStyle(icon ?? document.body).inlineSize).toBe(look.size);
  });

  test(`draws the filled library icon in ${look.platform}'s filled artwork`, async () => {
    followCorePlatform(look.platform);
    const { container } = await render(Icon, { name: "library", filled: true });

    const icon = container.querySelector("[data-icon]");

    expect(maskOf(icon ?? document.body)).toContain(look.filledArtwork);
  });
}

test("keeps Lucide on iOS, at a lighter stroke, where Framework7 has no artwork", async () => {
  followCorePlatform("ios");
  const { container } = await render(Icon, { name: "eraser" });

  const icon = container.querySelector("[data-icon]");

  expect(maskOf(icon ?? document.body)).toContain("lucide/light/eraser.svg");
});

test("lets a caller hide it with a class", async () => {
  const { container } = await render(Icon, {
    name: "library",
    class: "hidden",
  });

  const icon = container.querySelector("[data-icon]");

  expect(getComputedStyle(icon ?? document.body).display).toBe("none");
});

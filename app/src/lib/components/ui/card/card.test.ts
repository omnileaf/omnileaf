import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { Card } from "./index.ts";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test.each<{ platform: Platform; corner: string }>([
  { platform: "linux", corner: "14px" },
  { platform: "ios", corner: "10px" },
  { platform: "macos", corner: "10px" },
  { platform: "windows", corner: "8px" },
  { platform: "android", corner: "12px" },
])(
  "rounds a card's corners by $corner on $platform",
  async ({ platform, corner }) => {
    document.documentElement.dataset.platform = platform;
    const screen = await render(Card, { role: "group", "aria-label": "Books" });

    const card = screen.getByRole("group", { name: "Books" }).element();

    expect(getComputedStyle(card).borderTopLeftRadius).toBe(corner);
  },
);

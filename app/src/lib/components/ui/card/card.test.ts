import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { Card } from "./index.ts";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
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

async function cardOnGroupedGround(platform: Platform): Promise<HTMLElement> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  const ground = document.createElement("div");
  ground.dataset.ground = "grouped";
  document.body.append(ground);
  const screen = await render(Card, {
    target: ground,
    props: { role: "group", "aria-label": "Books" },
  });
  const card = screen.getByRole("group", { name: "Books" }).element();
  if (!(card instanceof HTMLElement)) {
    throw new Error("the card drew no element");
  }
  return card;
}

test.each<{ platform: Platform; fill: string; corner: string }>([
  { platform: "ios", fill: "rgb(255, 255, 255)", corner: "26px" },
  { platform: "android", fill: "rgb(239, 245, 238)", corner: "12px" },
])(
  "draws a card on the grouped ground as $platform's raised surface",
  async ({ platform, fill, corner }) => {
    const card = getComputedStyle(await cardOnGroupedGround(platform));

    expect(card.backgroundColor).toBe(fill);
    expect(card.borderTopLeftRadius).toBe(corner);
    expect(card.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  },
);

test("keeps a card's own shadow on Android, where cards can float over a page", async () => {
  followCorePlatform("android");
  const screen = await render(Card, {
    role: "group",
    "aria-label": "Guide",
    class: "shadow-card-rest",
  });

  const card = screen.getByRole("group", { name: "Guide" }).element();

  const layers = getComputedStyle(card).boxShadow.split(/,\s*(?=rgb)/);

  expect(layers.some((layer) => !layer.startsWith("rgba(0, 0, 0, 0)"))).toBe(
    true,
  );
});

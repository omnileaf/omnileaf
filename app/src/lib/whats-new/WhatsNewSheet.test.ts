import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import WhatsNewSheet from "./WhatsNewSheet.svelte";

const ANDROID_PHONE = { width: 412, height: 915 };
const KINDS: readonly ChangeKind[] = [
  "fix",
  "feat",
  "fix",
  "feat",
  "feat",
  "fix",
  "perf",
];
const NOTES: VersionNotes = {
  version: "0.2.0",
  entries: KINDS.map((kind, index) => ({
    kind,
    summary: `Change ${String(index + 1)}`,
  })),
};

async function openSheet() {
  const pressed: string[] = [];
  await render(WhatsNewSheet, {
    notes: NOTES,
    onSeeAll: () => {
      pressed.push("see all");
    },
    onClose: () => {
      pressed.push("close");
    },
  });
  return pressed;
}

function sheet() {
  return page.getByRole("dialog", { name: "What’s new in 0.2.0" });
}

beforeEach(async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await page.viewport(ANDROID_PHONE.width, ANDROID_PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("lists the first five notes under each kind's heading in the changelog's order", async () => {
  await openSheet();

  await expect
    .element(sheet().getByRole("heading", { level: 3 }).first())
    .toHaveTextContent("New");
  expect(
    sheet()
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent.trim()),
  ).toEqual(["New", "Faster", "Fixed"]);
  expect(
    sheet()
      .getByRole("listitem")
      .elements()
      .map((note) => note.textContent.trim()),
  ).toEqual(["Change 2", "Change 4", "Change 5", "Change 7", "Change 1"]);
});

test("closes from Got it and asks for every change from See all changes", async () => {
  const pressed = await openSheet();

  await sheet().getByRole("button", { name: "See all changes" }).click();
  await sheet().getByRole("button", { name: "Got it" }).click();

  expect(pressed).toEqual(["see all", "close"]);
});

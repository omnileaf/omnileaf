import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import JumpToBookListHarness from "./JumpToBookListHarness.svelte";

const PHONE = { width: 400, height: 800 };
const BADGE = { height: 20, paddingInline: "8px" };
const DETAIL_ICON = 16;

const ListWithAppContext = WithAppContext<{ platform: Platform }>;

async function openList(platform: Platform): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
  await render(ListWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: JumpToBookListHarness,
    pageProps: { platform },
  });
}

function rowTitle(title: string): HTMLElement {
  const element = [
    ...document.querySelectorAll<HTMLElement>("li a span"),
  ].findLast((span) => span.textContent.trim() === title);
  if (element === undefined) {
    throw new Error(`the list drew no ${title}`);
  }
  return element;
}

function badge(): HTMLElement {
  const element = document.querySelector("[data-slot='badge']");
  if (!(element instanceof HTMLElement)) {
    throw new Error("the list drew no badge");
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("keeps a read book's title in the strong ink on Android", async () => {
  await openList("android");

  expect(getComputedStyle(rowTitle("Volume 1")).color).toBe(
    getComputedStyle(rowTitle("Volume 3")).color,
  );
});

test("colours Android's Reading badge in the accent, 20 tall with 8 either side", async () => {
  await openList("android");
  const style = getComputedStyle(badge());

  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
  expect(style.color).toBe(
    resolvedColour("--native-color-on-button-primary", "color"),
  );
  expect(badge().getBoundingClientRect().height).toBe(BADGE.height);
  expect(style.paddingLeft).toBe(BADGE.paddingInline);
});

test("draws Android's check and bookmark as 16 Material icons", async () => {
  await openList("android");
  const icons = [...document.querySelectorAll("li a [data-icon]")];

  expect(icons.map((icon) => icon.getAttribute("data-icon"))).toEqual(
    expect.arrayContaining(["check", "bookmark"]),
  );
  for (const icon of icons) {
    expect(icon.getBoundingClientRect().width).toBe(DETAIL_ICON);
  }
});

test("keeps the iPhone's muted read title and Lucide check", async () => {
  await openList("ios");

  expect(getComputedStyle(rowTitle("Volume 1")).color).not.toBe(
    getComputedStyle(rowTitle("Volume 3")).color,
  );
  expect(document.querySelector("li a [data-icon]")).toBeNull();
});

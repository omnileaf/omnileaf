import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import CollectionHeadingHarness from "./CollectionHeadingHarness.svelte";

const actionsSnippet = createRawSnippet(() => ({
  render: () => '<button type="button">Action</button>',
}));

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("does not render folding title bar when largeTitle is false", async () => {
  followCorePlatform("android");
  const screen = await render(CollectionHeadingHarness, {
    title: "History",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "android",
    largeTitle: false,
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).toBeNull();
});

test("renders folding title bar when largeTitle is true and actions are present", async () => {
  const screen = await render(CollectionHeadingHarness, {
    title: "Library",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "ios",
    largeTitle: true,
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).not.toBeNull();
});

test("falls back to default platform behavior when largeTitle is undefined", async () => {
  followCorePlatform("macos");
  const screen = await render(CollectionHeadingHarness, {
    title: "History",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "macos",
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).toBeNull();
});

const PHONE = { width: 400, height: 800 };

async function drawnWithCount(stacksCount: boolean) {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform("android");
  await render(CollectionHeadingHarness, {
    title: "Library",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "android",
    seriesCount: 12,
    stacksCount,
  });
  const title = page.getByRole("heading", { name: "Library" }).element();
  const count = page.getByText("12 series").element();
  const header = document.querySelector("header");
  const style = getComputedStyle(count);
  return {
    titleInset: Number.parseFloat(getComputedStyle(title).paddingLeft),
    countInset:
      count.getBoundingClientRect().left - title.getBoundingClientRect().left,
    countGap:
      count.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
    countType: [
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ],
    headerTop: header?.getBoundingClientRect().top ?? 0,
    titleTop: title.getBoundingClientRect().top,
    countBottomToHeaderEnd:
      (header?.getBoundingClientRect().bottom ?? 0) -
      count.getBoundingClientRect().bottom,
  };
}

test("stacks the count flush under the title, 16px in, on an Android phone's library", async () => {
  const drawn = await drawnWithCount(true);

  expect(drawn).toMatchObject({
    titleInset: 0,
    countInset: 0,
    countGap: 0,
    countType: ["14px", "20px", "500", "0.1px"],
  });
  expect(drawn.titleTop - drawn.headerTop).toBe(4);
  expect(drawn.countBottomToHeaderEnd).toBe(16);
});

test("keeps the count where it was on an Android phone without the stacked look", async () => {
  const drawn = await drawnWithCount(false);

  expect(drawn.countInset).toBeGreaterThan(0);
});

for (const platform of ["ios", "macos", "windows", "linux"] as const) {
  test(`keeps the count in its plain type in a narrow ${platform} window`, async () => {
    await page.viewport(PHONE.width, PHONE.height);
    followCorePlatform(platform);
    await render(CollectionHeadingHarness, {
      title: "Library",
      showsLabel: false,
      actions: actionsSnippet,
      platform,
      seriesCount: 12,
    });
    const count = page.getByText("12 series").element();
    const plain = document.createElement("p");
    plain.className = "text-small text-muted";
    plain.textContent = "plain";
    count.after(plain);
    const type = (element: Element) => {
      const style = getComputedStyle(element);
      return [
        style.fontSize,
        style.lineHeight,
        style.fontWeight,
        style.letterSpacing,
      ];
    };

    expect(type(count)).toEqual(type(plain));
    expect(type(count)).toEqual(["14px", "20px", "400", "normal"]);
  });
}

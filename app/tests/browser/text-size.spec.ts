import type { Locator, Page } from "@playwright/test";

import { expect, onPlatform, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LARGEST_SCALE = 2;
const DEFAULT_BODY = 17;
const PROBE = "[data-system-text-size]";
const SERIES_IN_LIBRARY = 24;

interface TextBox {
  readonly size: number;
  readonly lineHeight: number;
}

function textBoxOf(text: Locator): Promise<TextBox> {
  return text.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      size: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
}

function libraryTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Library" });
}

function systemBodySize(size: number): string {
  return `${PROBE} { font-size: ${String(size)}px !important; }`;
}

async function openWithSystemBody(page: Page, size: number): Promise<void> {
  await page.addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.dataset.testSystemBody = "";
      style.textContent = css;
      document.head.append(style);
    });
  }, systemBodySize(size));
  await page.goto("/");
  await expect(libraryTitle(page)).toBeVisible();
}

test("grows the interface's text and its line spacing with the text scale", async ({
  page,
}) => {
  await page.goto("/");
  const title = libraryTitle(page);
  await expect(title).toBeVisible();
  const atDefault = await textBoxOf(title);

  await page.addStyleTag({
    content: `:root { --text-scale: ${String(LARGEST_SCALE)}; }`,
  });

  const enlarged = await textBoxOf(title);
  expect(enlarged.size).toBeCloseTo(atDefault.size * LARGEST_SCALE);
  expect(enlarged.lineHeight).toBeCloseTo(atDefault.lineHeight * LARGEST_SCALE);
});

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("follows the Dynamic Type size", async ({ page }) => {
    await openWithSystemBody(page, DEFAULT_BODY * 1.5);

    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            "--text-scale",
          ),
        ),
      )
      .toBe("1.5");
  });

  test("stops growing the text at twice its size", async ({ page }) => {
    await openWithSystemBody(page, 53);

    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            "--text-scale",
          ),
        ),
      )
      .toBe(String(LARGEST_SCALE));
  });

  test("keeps the text at its own size below the default Dynamic Type size", async ({
    page,
  }) => {
    await openWithSystemBody(page, 14);

    const scale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--text-scale",
      ),
    );
    expect(scale).toBe("1");
  });

  test("follows a Dynamic Type change while the app is open", async ({
    page,
  }) => {
    await openWithSystemBody(page, DEFAULT_BODY);

    await page.addStyleTag({ content: systemBodySize(DEFAULT_BODY * 2) });

    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            "--text-scale",
          ),
        ),
      )
      .toBe(String(LARGEST_SCALE));
  });
});

test.describe("on iOS with series in the library", () => {
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      librarySeries: pagedSeries(() => sampleSeries(SERIES_IN_LIBRARY)),
      librarySeriesCount: () => SERIES_IN_LIBRARY,
    },
  });

  test("lays the library's rows out again as Dynamic Type grows while it is open", async ({
    page,
  }) => {
    await openWithSystemBody(page, DEFAULT_BODY);
    await expect(page.getByText("Sample Series 0001")).toBeVisible();
    const rowStride = () =>
      page
        .locator(".virtual-rows")
        .evaluate((frame) =>
          Number.parseFloat(
            getComputedStyle(frame).getPropertyValue("--row-stride"),
          ),
        );
    const atDefault = await rowStride();

    await page.addStyleTag({ content: systemBodySize(DEFAULT_BODY * 2) });

    await expect.poll(rowStride).toBeGreaterThan(atDefault);
  });
});

test.describe("on Android", () => {
  test.use(onPlatform("android"));

  test("leaves the text to the web view's own text zoom", async ({ page }) => {
    await openWithSystemBody(page, DEFAULT_BODY * 2);

    expect(await page.locator(PROBE).count()).toBe(0);
  });
});

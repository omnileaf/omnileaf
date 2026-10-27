import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const WIDE_QUERY = "(min-width: 700px)";
const NARROW = { width: 500, height: 800 };
const WIDE = { width: 1000, height: 800 };
const PAUSE_AHEAD_MS = 60_000;

type HeardWidth = "narrow" | "wide";

async function showPageHearingItsWidth(page: Page): Promise<void> {
  await page.setContent(`
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width" />
        <title>Resize</title>
      </head>
      <body></body>
    </html>
  `);
  await page.evaluate((query) => {
    const wide = matchMedia(query);
    const hear = () => {
      document.documentElement.dataset.heard = wide.matches ? "wide" : "narrow";
    };
    hear();
    wide.addEventListener("change", hear);
  }, WIDE_QUERY);
}

function heardWidth(page: Page): Promise<HeardWidth | undefined> {
  return page.evaluate(() => {
    const heard = document.documentElement.dataset.heard;
    return heard === "narrow" || heard === "wide" ? heard : undefined;
  });
}

test("lets the page hear its media queries change before a resize resolves", async ({
  page,
}) => {
  await page.setViewportSize(NARROW);
  await showPageHearingItsWidth(page);

  await page.setViewportSize(WIDE);

  expect(await heardWidth(page)).toBe("wide");
});

test("fails naming the size when the page's clock holds its frames after a resize", async ({
  page,
}) => {
  await page.clock.install();
  await showPageHearingItsWidth(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_AHEAD_MS);

  const resized = page.setViewportSize(WIDE);

  await expect(resized).rejects.toThrow(
    `resizing to ${String(WIDE.width)}x${String(WIDE.height)}`,
  );
});

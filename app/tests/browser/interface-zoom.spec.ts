import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const PINCH_OUT = 2;

function viewportSettings(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const content =
      document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute("content") ?? "";
    return Object.fromEntries(
      content.split(",").map((setting) => {
        const [key = "", value = ""] = setting.split("=");
        return [key.trim(), value.trim()];
      }),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("keeps the interface from scaling on a pinch or double tap", async ({
  page,
}) => {
  const settings = await viewportSettings(page);
  const touchAction = await page.evaluate(
    () => getComputedStyle(document.documentElement).touchAction,
  );

  expect(settings).toMatchObject({
    "maximum-scale": "1",
    "user-scalable": "no",
  });
  expect(touchAction).toBe("pan-x pan-y");
});

test("stays at its own size when pinched", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== "chromium" || !isMobile,
    "pinches a touch screen through Chromium's protocol",
  );
  const session = await page.context().newCDPSession(page);

  await session.send("Input.synthesizePinchGesture", {
    x: 100,
    y: 100,
    scaleFactor: PINCH_OUT,
    gestureSourceType: "touch",
  });

  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
});

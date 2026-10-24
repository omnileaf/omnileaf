import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import ConfirmDialogHarness from "#lib/page/ConfirmDialogHarness.svelte";
import { followCorePlatform } from "#lib/page/platform.ts";

import DrawerHarness from "./DrawerHarness.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

interface DrawnSheet {
  readonly sheet: Element;
  readonly handle: Element;
  readonly scrim: Element;
  readonly content: Element;
}

function asElement(element: Element | null | undefined): Element {
  if (element === null || element === undefined) {
    throw new Error("the sheet drew no element");
  }
  return element;
}

async function sheetOn(
  platform: Platform,
  theme: string,
  callerClass?: string,
): Promise<DrawnSheet> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(DrawerHarness, { class: callerClass });
  const sheet = page.getByRole("dialog", { name: "Volume 3" });
  await expect.element(sheet).toBeVisible();
  return {
    sheet: sheet.element(),
    handle: asElement(
      sheet.element().querySelector(":scope > span[aria-hidden]"),
    ),
    scrim: asElement(document.querySelector("[data-dialog-overlay]")),
    content: page.getByText("Mark read").element(),
  };
}

function sizeOf(element: Element): [number, number] {
  const { width, height } = element.getBoundingClientRect();
  return [width, height];
}

function backgroundOf(element: Element): string {
  return getComputedStyle(element).backgroundColor;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("rounds iOS's sheet by 38 on a white surface under a 36 by 5 grabber", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const { sheet, handle, scrim } = await sheetOn("ios", "light");

  expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("38px");
  expect(getComputedStyle(sheet).borderTopRightRadius).toBe("38px");
  expect(backgroundOf(sheet)).toBe("rgb(255, 255, 255)");
  expect(sizeOf(handle)).toEqual([36, 5]);
  expect(getComputedStyle(handle).borderRadius).not.toBe("0px");
  expect(backgroundOf(handle)).toBe("rgba(60, 60, 67, 0.3)");
  expect(backgroundOf(scrim)).toBe("rgba(0, 0, 0, 0.4)");
});

test("darkens iOS's sheet and grabber for the dark theme", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const { sheet, handle, scrim } = await sheetOn("ios", "dark");

  expect(backgroundOf(sheet)).toBe("rgb(28, 28, 30)");
  expect(backgroundOf(handle)).toBe("rgba(235, 235, 245, 0.3)");
  expect(backgroundOf(scrim)).toBe("rgba(0, 0, 0, 0.4)");
});

test("rounds Android's sheet by 28 with a 32 by 4 handle centred in a 48 tall area", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const { sheet, handle, scrim, content } = await sheetOn("android", "light");
  const top = sheet.getBoundingClientRect().top;
  const handleBox = handle.getBoundingClientRect();

  expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("28px");
  expect(backgroundOf(sheet)).toBe("rgb(239, 245, 238)");
  expect(sizeOf(handle)).toEqual([32, 4]);
  expect(handleBox.top - top).toBeCloseTo(22, 0);
  expect(content.getBoundingClientRect().top - top).toBeCloseTo(48, 0);
  expect(backgroundOf(handle)).toBe("rgba(88, 97, 90, 0.4)");
  expect(backgroundOf(scrim)).toMatch(/^rgba\(0, 0, 0, 0\.32\d*\)$/);
});

test("darkens Android's sheet and handle for the dark theme", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const { sheet, handle } = await sheetOn("android", "dark");

  expect(backgroundOf(sheet)).toBe("rgb(15, 21, 17)");
  expect(backgroundOf(handle)).toBe("rgba(164, 174, 165, 0.4)");
});

test("keeps today's sheet on Linux at a phone's width", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const { sheet, handle, scrim } = await sheetOn("linux", "light");

  expect(
    [sheet, handle, scrim].map((element) => element.className).join(" "),
  ).not.toContain("native");
  expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("10px");
  expect(sizeOf(handle)).toEqual([100, 8]);
});

test("keeps today's sheet on an iOS and an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const ios = await sheetOn("ios", "light");
  const iosCorner = getComputedStyle(ios.sheet).borderTopLeftRadius;
  const iosHandle = sizeOf(ios.handle);
  document.body.replaceChildren();
  const android = await sheetOn("android", "light");

  expect(iosCorner).toBe("14px");
  expect(iosHandle).toEqual([36, 5]);
  expect(getComputedStyle(android.sheet).borderTopLeftRadius).toBe("28px");
  expect(backgroundOf(android.handle)).not.toBe("rgba(88, 97, 90, 0.4)");
});

test.each(["gap-lg", "pbs-md"])(
  "starts Android's content right under the 48 tall handle area when the caller sets %s",
  async (callerClass) => {
    await page.viewport(PHONE.width, PHONE.height);

    const { sheet, handle, content } = await sheetOn(
      "android",
      "light",
      callerClass,
    );
    const box = sheet.getBoundingClientRect();
    const handleBox = handle.getBoundingClientRect();

    expect(handleBox.top - box.top).toBeCloseTo(22, 0);
    expect(handleBox.left + handleBox.width / 2).toBeCloseTo(
      box.left + box.width / 2,
      0,
    );
    expect(content.getBoundingClientRect().top - box.top).toBeCloseTo(48, 0);
  },
);

test.each<[Platform, string]>([
  ["ios", "38px"],
  ["android", "28px"],
  ["linux", "24px"],
])("rounds a confirm sheet on a %s phone by %s", async (platform, corner) => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(ConfirmDialogHarness);

  const sheet = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(sheet).toBeVisible();

  expect(getComputedStyle(sheet.element()).borderTopLeftRadius).toBe(corner);
});

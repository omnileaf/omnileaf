import type { Locator } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const PHONE_BUTTON_HEIGHT: Readonly<Partial<Record<Platform, number>>> = {
  ios: 50,
  android: 40,
};

async function expectPhoneButton(
  button: Locator,
  platform: Platform | undefined,
): Promise<void> {
  await expect(button).toBeVisible();
  const height =
    platform === undefined ? undefined : PHONE_BUTTON_HEIGHT[platform];
  if (height === undefined) {
    return;
  }
  const box = await boxOf(button);
  const corner = await button.evaluate(
    (element) => getComputedStyle(element).borderStartStartRadius,
  );

  expect(box.height).toBeCloseTo(height, 0);
  expect(parseFloat(corner)).toBeGreaterThanOrEqual(box.height / 2);
}

test.describe("an empty library, on a phone", { tag: "@native" }, () => {
  test("offers Add a folder as the phone's own main button", async ({
    page,
    platform,
  }) => {
    await page.goto("/");

    await expectPhoneButton(
      page
        .getByRole("region", { name: "Your library is empty" })
        .getByRole("button", { name: "Add a folder" }),
      platform,
    );
    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe(
  "a library that can't be read, on a phone",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        librarySeries: () => {
          throw new CommandFailure({
            code: "internal",
            message: "the library could not be read",
          });
        },
      },
    });

    test("offers Try again as the phone's own second button", async ({
      page,
      platform,
    }) => {
      await page.goto("/");

      await expectPhoneButton(
        page.getByRole("alert").getByRole("button", { name: "Try again" }),
        platform,
      );
    });
  },
);

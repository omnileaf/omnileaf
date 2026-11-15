import type { SystemClock } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, leaveAndComeBack, test } from "./fixtures.ts";

let clock: SystemClock = "twentyFourHour";

test.use({
  backend: { ...DEFAULT_BACKEND, systemClock: () => clock },
});

test.describe("The clock on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android names its own clock");
    clock = "twentyFourHour";
  });

  test("follows the phone's 24-hour clock while the time format is System", async ({
    page,
  }) => {
    await page.goto("/settings/general/time-format");

    await expect(
      page.getByRole("radio", { name: "Follow the system (24-hour)" }),
    ).toBeChecked();
  });

  test("follows a clock changed on the phone when the app comes back to the front", async ({
    page,
  }) => {
    await page.goto("/settings/general/time-format");
    await expect(
      page.getByRole("radio", { name: "Follow the system (24-hour)" }),
    ).toBeChecked();
    clock = "twelveHour";

    await leaveAndComeBack(page);

    await expect(
      page.getByRole("radio", { name: "Follow the system (12-hour)" }),
    ).toBeChecked();
  });
});

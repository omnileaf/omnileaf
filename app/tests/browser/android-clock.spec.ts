import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({
  backend: { ...DEFAULT_BACKEND, systemClock: () => "twentyFourHour" },
});

test.describe("The clock on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android names its own clock");
  });

  test("follows the phone's 24-hour clock while the time format is System", async ({
    page,
  }) => {
    await page.goto("/settings/general/time-format");

    await expect(
      page.getByRole("radio", { name: "Follow the system (24-hour)" }),
    ).toBeChecked();
  });
});

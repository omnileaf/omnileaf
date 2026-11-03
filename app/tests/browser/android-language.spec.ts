import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const SYSTEM_OFFERS =
  "Your phone's settings, under Apps, Omnileaf, Language, can also change this.";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    systemAppLanguage: () => ({ offered: true, tag: null }),
  },
});

test.describe("Language on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("lists the languages as radio rows, the system one first with its language under it", async ({
    page,
  }) => {
    await page.goto("/settings/general/language");
    const system = page.getByRole("radio", { name: /Use the system language/ });
    const mark = system.locator("[data-radio-mark]");

    await expect(system).toBeChecked();
    await expect(mark).toHaveCSS("border-top-width", "2px");
    expect((await boxOf(mark)).width).toBeCloseTo(20, 0);
    await expect(system.getByText("Use the system language")).toHaveCSS(
      "font-weight",
      "400",
    );
    await expect(system.locator("svg:visible")).toHaveCount(0);
  });

  test("says the system also offers the language on Android 13 and later", async ({
    page,
  }) => {
    await page.goto("/settings/general/language");

    await expect(page.getByText(SYSTEM_OFFERS)).toBeVisible();
  });
});

test.describe(
  "Language on an Android phone before Android 13",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        systemAppLanguage: () => ({ offered: false, tag: null }),
      },
    });

    test("leaves the system's language list out of the page", async ({
      page,
    }) => {
      await page.goto("/settings/general/language");

      await expect(page.getByText(/Each language is shown/)).toBeVisible();
      await expect(page.getByText(SYSTEM_OFFERS)).toHaveCount(0);
    });
  },
);

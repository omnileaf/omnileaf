import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const PHONE_HINT = "Omnileaf uses your phone's language unless you pick one.";
const PHONE_ROW_HEIGHT = 56;
const TOUCH_ROW_HEIGHT = 48;
const POINTER_ROW_HEIGHT = 44;

function languageRow(page: Page) {
  return page.getByRole("main").getByRole("link", { name: /^Language/ });
}

async function openGeneral(page: Page): Promise<void> {
  await page.goto("/settings/general");
  await expect(
    page.getByRole("heading", { level: 1, name: "General" }),
  ).toBeVisible();
}

test("follows the system language by default", async ({ page }) => {
  await openGeneral(page);

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("shows the current language in its own name on General", async ({
  page,
}) => {
  await openGeneral(page);

  const current = languageRow(page).locator("[lang]");

  await expect(current).toHaveText("English");
  await expect(current).toHaveAttribute("lang", "en");
});

test("picks a language and comes back to General", async ({ page }) => {
  await openGeneral(page);
  const english = page.getByRole("radio", { name: "English", exact: true });

  await languageRow(page).click();
  await expect(page).toHaveURL("/settings/general/language");
  await expect(
    page.getByRole("heading", { level: 1, name: "Language" }),
  ).toBeFocused();
  await page.locator("label").filter({ has: english }).click();
  await expect(english).toBeChecked();
  await page
    .getByRole("link", { name: /^(Back to )?General$/ })
    .filter({ visible: true })
    .click();

  await expect(page).toHaveURL("/settings/general");
  await expect(languageRow(page)).toContainText("English");
});

test("points the Language row's chevron toward the end of the line in a right-to-left language", async ({
  page,
}) => {
  await openGeneral(page);
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  await expect(languageRow(page).locator("svg")).toHaveCSS("scale", "-1 1");
});

test.describe("on an Android phone", () => {
  test.use(onPlatform("android"));

  test("explains the system language under a 56px row", async ({ page }) => {
    await page.goto("/settings/general");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

    const row = await boxOf(languageRow(page));

    expect(row.height).toBe(PHONE_ROW_HEIGHT);
    await expect(languageRow(page)).toHaveAccessibleDescription(PHONE_HINT);
  });
});

test.describe("on an Android tablet", () => {
  test.use(onPlatform("android"));

  test("shows the Language row 48px tall", async ({ page }) => {
    await page.goto("/settings/general");
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "tablets only");

    const row = await boxOf(languageRow(page));

    expect(row.height).toBe(TOUCH_ROW_HEIGHT);
    await expect(page.getByText(PHONE_HINT)).toBeHidden();
  });
});

test.describe("on a desktop", () => {
  test.use(onPlatform("linux"));

  test("shows the Language row 44px tall", async ({ page }) => {
    await page.goto("/settings/general");

    const row = await boxOf(languageRow(page));

    expect(row.height).toBe(POINTER_ROW_HEIGHT);
    await expect(page.getByText(PHONE_HINT)).toBeHidden();
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      test.use(onPlatform(platform));

      test(`Settings › General has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/settings/general");
        await expect(
          page.getByRole("heading", { level: 1, name: "General" }),
        ).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });
    });
  }
}

test.describe("sorting the library", () => {
  const told: string[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      setAppLanguage: (language) => {
        told.push(language);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    told.length = 0;
  });

  test("tells the library the language the app shows", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(told).toEqual(["en"]);
  });

  test("tells the library again when another language is chosen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("seeded") === null) {
        window.sessionStorage.setItem("seeded", "yes");
        window.localStorage.setItem("omnileaf.language", "en-XA");
      }
    });
    await page.goto("/settings/general/language");
    await expect.poll(() => told).toEqual(["en-XA"]);

    await page
      .locator("label")
      .filter({
        has: page.getByRole("radio", { name: "English", exact: true }),
      })
      .click();

    await expect.poll(() => told).toEqual(["en-XA", "en"]);
  });

  test("tells the library the language chosen in Settings", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(told).toEqual(["en-XA"]);
  });
});

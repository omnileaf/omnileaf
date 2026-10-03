import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const LANGUAGE_PAGE = "/settings/general/language";
const SYSTEM_OPTION = "Use the system language (English)";
const FOOTNOTE = "More languages arrive as people translate Omnileaf.";
const GROUP_GAP = 16;
const PHONE_ROW_HEIGHT = 56;
const TOUCH_ROW_HEIGHT = 48;
const POINTER_ROW_HEIGHT = 44;
const PHONE_CHECK_SIZE = 22;
const CHECK_SIZE = 20;

function option(page: Page, name: string) {
  return page.getByRole("radio", { name, exact: true });
}

function optionRow(page: Page, name: string) {
  return page.locator("label").filter({ has: option(page, name) });
}

async function chooseEnglish(page: Page): Promise<void> {
  await Promise.all([
    page.waitForEvent("load"),
    optionRow(page, "English").click(),
  ]);
}

test("checks the system language until another is chosen", async ({ page }) => {
  await page.goto(LANGUAGE_PAGE);

  await expect(option(page, SYSTEM_OPTION)).toBeChecked();
  await expect(option(page, "English")).not.toBeChecked();
});

test("writes each language in its own name", async ({ page }) => {
  await page.goto(LANGUAGE_PAGE);

  await expect(optionRow(page, "English").locator("[lang]")).toHaveAttribute(
    "lang",
    "en",
  );
});

test("moves the check to a chosen language and keeps it", async ({ page }) => {
  await page.goto(LANGUAGE_PAGE);

  await chooseEnglish(page);

  await expect(option(page, "English")).toBeChecked();
  await expect(optionRow(page, "English").locator("svg")).toBeVisible();
  await expect(optionRow(page, SYSTEM_OPTION).locator("svg")).toHaveCount(0);
});

test("goes back to the system language", async ({ page }) => {
  await page.goto(LANGUAGE_PAGE);
  await chooseEnglish(page);

  await Promise.all([
    page.waitForEvent("load"),
    optionRow(page, SYSTEM_OPTION).click(),
  ]);

  await expect(option(page, SYSTEM_OPTION)).toBeChecked();
  await expect(optionRow(page, SYSTEM_OPTION).locator("svg")).toBeVisible();
});

test("names the system's own language while another is chosen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("omnileaf.language", "en-XA");
  });

  await page.goto(LANGUAGE_PAGE);

  const system = page.getByRole("radio").first();
  const systemName = page
    .getByRole("radiogroup")
    .locator("label")
    .first()
    .locator("[lang]");

  await expect(system).toHaveAccessibleName(/\(English\)/);
  await expect(systemName).toHaveText("English");
  await expect(systemName).toHaveAttribute("lang", "en");
});

test.describe("on an Android phone", () => {
  test.use(onPlatform("android"));

  test("lists every option in one group of 56px rows over a footnote", async ({
    page,
  }) => {
    await page.goto(LANGUAGE_PAGE);
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

    const system = await boxOf(optionRow(page, SYSTEM_OPTION));
    const english = await boxOf(optionRow(page, "English"));
    const check = await boxOf(optionRow(page, SYSTEM_OPTION).locator("svg"));

    expect(system.height).toBe(PHONE_ROW_HEIGHT);
    expect(english.y).toBe(system.y + system.height);
    expect(check.width).toBe(PHONE_CHECK_SIZE);
    await expect(page.getByText(FOOTNOTE)).toBeVisible();
  });

  test("leads back to General", async ({ page }) => {
    await page.goto(LANGUAGE_PAGE);
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

    await expect(
      page.getByRole("link", { name: "Back to General" }),
    ).toHaveAttribute("href", "/settings/general");
  });
});

test.describe("on an Android tablet", () => {
  test.use(onPlatform("android"));

  test("sets the system language apart on 48px rows", async ({ page }) => {
    await page.goto(LANGUAGE_PAGE);
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "tablets only");

    const system = await boxOf(optionRow(page, SYSTEM_OPTION));
    const english = await boxOf(optionRow(page, "English"));

    expect(system.height).toBe(TOUCH_ROW_HEIGHT);
    expect(english.y - (system.y + system.height)).toBeGreaterThanOrEqual(
      GROUP_GAP,
    );
    await expect(page.getByText(FOOTNOTE)).toBeHidden();
  });
});

test.describe("on a desktop", () => {
  test.use(onPlatform("linux"));

  test("sets the system language apart on 44px rows with a 20px check", async ({
    page,
  }) => {
    await page.goto(LANGUAGE_PAGE);

    const system = await boxOf(optionRow(page, SYSTEM_OPTION));
    const english = await boxOf(optionRow(page, "English"));
    const check = await boxOf(optionRow(page, SYSTEM_OPTION).locator("svg"));

    expect(system.height).toBe(POINTER_ROW_HEIGHT);
    expect(english.y - (system.y + system.height)).toBeGreaterThanOrEqual(
      GROUP_GAP,
    );
    expect(check.width).toBe(CHECK_SIZE);
    await expect(page.getByText(FOOTNOTE)).toBeHidden();
  });

  test("keeps General selected beside the page from 600px", async ({
    page,
  }) => {
    await page.goto(LANGUAGE_PAGE);
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");

    await expect(
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "General" }),
    ).toHaveAttribute("aria-current", "true");
    await expect(
      page.getByRole("link", { name: "Back to General" }),
    ).toBeHidden();
  });

  test("leads back to General through a link under 600px", async ({ page }) => {
    await page.goto(LANGUAGE_PAGE);
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "one pane only");

    await expect(
      page.getByRole("link", { name: "Back to General" }),
    ).toHaveText("General");
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      test.use(onPlatform(platform));

      test(`Settings › General › Language has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(LANGUAGE_PAGE);
        await expect(
          page.getByRole("heading", { level: 1, name: "Language" }),
        ).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });
    });
  }
}

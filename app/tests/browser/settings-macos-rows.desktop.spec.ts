import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const WINDOW = { width: 1280, height: 800 };
const ROW_MIN = "42px";
const PLATE_RADIUS = "12px";
const PLATE_INSET = "10px";
const CHEVRON_SIZE = 12;
const TITLE_TYPE = { fontSize: "13px", fontWeight: "510", lineHeight: "16px" };
const HEADING_TYPE = {
  fontSize: "11px",
  fontWeight: "590",
  lineHeight: "14px",
};

function section(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

async function expectPlate(plate: Locator, page: Page): Promise<void> {
  await expect(plate).toHaveCSS("border-top-width", "0px");
  await expect(plate).toHaveCSS("border-radius", PLATE_RADIUS);
  await expect(plate).toHaveCSS("padding-left", PLATE_INSET);
  await expect(plate).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-group"),
  );
}

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.describe("the Language row on the General page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/general");
    await expect(section(page, "Language")).toBeVisible();
  });

  test("sits alone in a rounded plate without a border", async ({ page }) => {
    await expectPlate(section(page, "Language"), page);
  });

  test("is at least 42px tall and opens the language page", async ({
    page,
  }) => {
    const row = section(page, "Language").getByRole("link");

    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(42);
    await expect(row).toHaveCSS("min-height", ROW_MIN);
    await expect(row).toHaveAttribute("href", /\/settings\/general\/language$/);
  });

  test("sets its title in 13px 510 type", async ({ page }) => {
    const title = section(page, "Language").getByText("Language", {
      exact: true,
    });

    await expect(title).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(title).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
    await expect(title).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
  });

  test("shows the chosen language in muted type before a 12px chevron", async ({
    page,
  }) => {
    const row = section(page, "Language").getByRole("link");
    const value = row.locator("[lang]");
    const chevron = row.locator("svg");

    await expect(value).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(value).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect((await boxOf(chevron)).width).toBe(CHEVRON_SIZE);
  });
});

test("darkens the whole Language row while the mouse is held down on it", async ({
  page,
}) => {
  await page.goto("/settings/general");
  const link = section(page, "Language").getByRole("link");
  const box = await boxOf(link);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();

  await expect(link).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-group-row-pressed"),
  );
  await page.mouse.up();
});

test.describe("the Time format row on the General page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/general");
    await expect(
      page.getByRole("combobox", { name: "Time format" }),
    ).toBeVisible();
  });

  test("sits under a Dates and numbers heading in 11px 590 type", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Dates and numbers" });

    await expect(heading).toHaveCSS("font-size", HEADING_TYPE.fontSize);
    await expect(heading).toHaveCSS("font-weight", HEADING_TYPE.fontWeight);
    await expect(heading).toHaveCSS("line-height", HEADING_TYPE.lineHeight);
    await expect(section(page, "Dates and numbers")).toBeVisible();
  });

  test("is a pop-up button in a plated row at least 42px tall", async ({
    page,
  }) => {
    const plate = section(page, "Dates and numbers").locator(":scope > div");

    await expectPlate(plate, page);
    expect((await boxOf(plate)).height).toBeGreaterThanOrEqual(42);
    await expect(
      page.getByRole("radiogroup", { name: "Time format" }),
    ).toHaveCount(0);
  });

  test("names the row in 13px 510 type", async ({ page }) => {
    const title = section(page, "Dates and numbers").getByText("Time format", {
      exact: true,
    });

    await expect(title).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(title).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
  });

  test("offers the three formats and keeps the one chosen", async ({
    page,
  }) => {
    const select = page.getByRole("combobox", { name: "Time format" });

    await expect(select.getByRole("option")).toHaveText([
      /^Follow the system \((12|24)-hour\)$/,
      "12-hour",
      "24-hour",
    ]);
    await select.selectOption({ label: "12-hour" });
    await page.reload();

    await expect(select).toHaveValue("twelveHour");
  });
});

for (const [name, platform, viewport] of [
  ["Windows", "windows", { width: 1600, height: 900 }],
  ["Linux", "linux", { width: 1600, height: 900 }],
  ["an iPad", "ios", { width: 1180, height: 820 }],
] as const) {
  test.describe(`on ${name}`, () => {
    test.use({ platform, viewport });

    test("keeps the Language card and the Time format radio buttons", async ({
      page,
    }) => {
      await page.goto("/settings/general");

      await expect(
        page.getByRole("radiogroup", { name: "Time format" }),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Time format" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /^Language/ }).locator(".."),
      ).toHaveCSS("border-top-width", "1px");
    });
  });
}

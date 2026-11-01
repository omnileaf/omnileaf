import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const WINDOW = { width: 1280, height: 800 };
const ROW_MIN = "42px";
const PLATE_RADIUS = "12px";
const PLATE_INSET = "10px";
const CHEVRON_SIZE = 12;
const TITLE_TYPE = {
  fontSize: "13px",
  fontWeight: "510",
  lineHeight: "16px",
  letterSpacing: "-0.08px",
};
const TEXT_PADDING = "6px";
const PRESSED = {
  light: "rgba(0, 0, 0, 0.03)",
  dark: "rgba(255, 255, 255, 0.05)",
};
const SELECT_END_PADDING = "28px";
const CLEAR_SHADOW = /^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/;
const ARROWS_CIRCLE = 16;
const ARROWS_CIRCLE_CSS = `${String(ARROWS_CIRCLE)}px`;
const ARROWS_SIZE = 10;
const ARROWS_INSET = 3;
const SUB_TYPE = { fontSize: "11px", lineHeight: "14px" };
const HEADING_TYPE = {
  fontSize: "11px",
  fontWeight: "590",
  lineHeight: "14px",
};
const ADULT_PAGE = "/settings/library/adult-content";
const AGE_RATINGS = "Use age ratings from book details";

function section(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

async function holdMouseOn(page: Page, target: Locator): Promise<void> {
  const box = await boxOf(target);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press("Shift");
  await target.focus();
}

async function pseudoStyle(target: Locator, property: string): Promise<string> {
  return target.evaluate(
    (node, name) => getComputedStyle(node, "::after").getPropertyValue(name),
    property,
  );
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
    await expect(title).toHaveCSS("letter-spacing", TITLE_TYPE.letterSpacing);
  });

  test("pads its title 6px above and below", async ({ page }) => {
    const title = section(page, "Language").getByText("Language", {
      exact: true,
    });

    await expect(title).toHaveCSS("padding-top", TEXT_PADDING);
    await expect(title).toHaveCSS("padding-bottom", TEXT_PADDING);
  });

  test("shows the chosen language in regular muted type before a 12px chevron", async ({
    page,
  }) => {
    const row = section(page, "Language").getByRole("link");
    const value = row.locator("[lang]");
    const chevron = row.locator("svg");

    await expect(value).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(value).toHaveCSS("font-weight", "400");
    await expect(value).toHaveCSS("letter-spacing", "normal");
    await expect(value).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect((await boxOf(chevron)).width).toBe(CHEVRON_SIZE);
  });
});

test.describe("pressing the Language row", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/general");
    await expect(section(page, "Language")).toBeVisible();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`darkens the whole row in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const link = section(page, "Language").getByRole("link");

      try {
        await holdMouseOn(page, link);
        await expect(link).toHaveCSS(
          "background-color",
          await literalColour(page, PRESSED[scheme]),
        );
      } finally {
        await page.mouse.up();
      }
    });
  }

  test("draws no hover tint", async ({ page }) => {
    const link = section(page, "Language").getByRole("link");
    const box = await boxOf(link);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("rings the row when reached with the keyboard", async ({ page }) => {
    const link = section(page, "Language").getByRole("link");

    await focusByKeyboard(page, link);

    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    await expect(link).toHaveCSS("outline-offset", "-2px");
  });
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
    await expect(title).toHaveCSS("letter-spacing", TITLE_TYPE.letterSpacing);
    await expect(title).toHaveCSS("padding-top", TEXT_PADDING);
  });

  test("draws the select flat inside the row, with no box of its own", async ({
    page,
  }) => {
    const select = page.getByRole("combobox", { name: "Time format" });

    await expect(select).toHaveCSS("border-top-width", "0px");
    await expect(select).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(select).toHaveCSS("box-shadow", CLEAR_SHADOW);
    await expect(select).toHaveCSS("padding-left", "0px");
    await expect(select).toHaveCSS("padding-right", SELECT_END_PADDING);
  });

  test("sets a 10px pair of arrows in a 16px circle at the row's end", async ({
    page,
  }) => {
    const select = page.getByRole("combobox", { name: "Time format" });
    const field = select.locator("..");
    const arrows = field.locator("svg");
    const fieldBox = await boxOf(field);
    const arrowsBox = await boxOf(arrows);

    expect(arrowsBox.width).toBe(ARROWS_SIZE);
    expect(fieldBox.x + fieldBox.width - (arrowsBox.x + arrowsBox.width)).toBe(
      ARROWS_INSET,
    );
    expect(await pseudoStyle(field, "width")).toBe(ARROWS_CIRCLE_CSS);
    expect(await pseudoStyle(field, "height")).toBe(ARROWS_CIRCLE_CSS);
    expect(
      Number.parseFloat(await pseudoStyle(field, "border-radius")),
    ).toBeGreaterThanOrEqual(ARROWS_CIRCLE / 2);
    expect(await pseudoStyle(field, "background-color")).toBe(
      await tokenColour(page, "--native-color-button-secondary"),
    );
  });

  test("darkens the circle while the mouse is held on the select", async ({
    page,
  }) => {
    const select = page.getByRole("combobox", { name: "Time format" });

    try {
      await holdMouseOn(page, select);
      await expect
        .poll(async () => pseudoStyle(select.locator(".."), "background-color"))
        .toBe(await tokenColour(page, "--native-color-control-fill-pressed"));
    } finally {
      await page.mouse.up();
      await page.keyboard.press("Escape");
    }
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

test.describe("the age ratings row on the 18+ content page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADULT_PAGE);
    await expect(page.getByRole("switch", { name: AGE_RATINGS })).toBeVisible();
  });

  test("is at least 42px tall", async ({ page }) => {
    const row = page.getByRole("switch", { name: AGE_RATINGS });

    await expect(row).toHaveCSS("min-height", ROW_MIN);
  });

  test("pads its words 6px above and below", async ({ page }) => {
    const words = page.getByText(AGE_RATINGS, { exact: true }).locator("..");

    await expect(words).toHaveCSS("padding-top", TEXT_PADDING);
    await expect(words).toHaveCSS("padding-bottom", TEXT_PADDING);
  });

  test("draws no hover tint", async ({ page }) => {
    const row = page.getByRole("switch", { name: AGE_RATINGS });
    const rest = await row.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    const box = await boxOf(row);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await expect(row).toHaveCSS("background-color", rest);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`darkens the whole row while pressed in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const row = page.getByRole("switch", { name: AGE_RATINGS });

      try {
        await holdMouseOn(page, row);
        await expect(row).toHaveCSS(
          "background-color",
          await literalColour(page, PRESSED[scheme]),
        );
      } finally {
        await page.mouse.up();
      }
    });
  }

  test("sets its title in 13px 510 type", async ({ page }) => {
    const title = page.getByText(AGE_RATINGS, { exact: true });

    await expect(title).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(title).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
    await expect(title).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
    await expect(title).toHaveCSS("letter-spacing", TITLE_TYPE.letterSpacing);
  });

  test("sets its line in 11px muted type", async ({ page }) => {
    const line = page.getByText("Off: only series you mark 18+ by hand count.");

    await expect(line).toHaveCSS("font-size", SUB_TYPE.fontSize);
    await expect(line).toHaveCSS("line-height", SUB_TYPE.lineHeight);
    await expect(line).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
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

    test("keeps the age ratings row's own padding, gap and type", async ({
      page,
    }) => {
      await page.goto(ADULT_PAGE);
      const row = page.getByRole("switch", { name: AGE_RATINGS });
      const title = page.getByText(AGE_RATINGS, { exact: true });

      await expect(row).toHaveCSS("padding", "12px 16px");
      await expect(row).toHaveCSS("column-gap", "12px");
      await expect(title).toHaveCSS("font-weight", "600");
      await expect(title).toHaveCSS("letter-spacing", "normal");
      await expect(title.locator("..")).toHaveCSS("padding-top", "0px");
    });
  });
}

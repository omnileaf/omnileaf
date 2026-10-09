import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  selectedByDoubleClick,
  test,
  viewportOf,
} from "./fixtures.ts";

const MISSING_ADDRESS = "/sample/missing-page";
const DESKTOP_PROBLEM_TOP = 170;
const TITLE_SIZE = "24px";
const TITLE_LINE_HEIGHT = 30;
const WELL = "rgb(243, 240, 233)";
const MUTED = "rgb(95, 91, 82)";
const ACCENT_SOFT = "rgb(221, 235, 226)";
const DETAIL_CORNER = "12px";
const BODY_LINE_HEIGHT_RATIO = 1.5;

const SHAPES = {
  linux: { badge: 36, icon: 18, body: 14, button: 36, buttonCorner: 10 },
  android: { badge: 40, icon: 20, body: 15, button: 52, buttonCorner: 26 },
  ios: { badge: 40, icon: 20, body: 15, button: 52, buttonCorner: 14 },
} as const;

function problemTitle(page: Page): Locator {
  return page.getByRole("heading", {
    level: 1,
    name: "This page doesn't exist",
  });
}

function badgeOf(title: Locator): Locator {
  return title.locator("xpath=preceding-sibling::*[1]");
}

function goToLibrary(page: Page): Locator {
  return page.getByRole("main").getByRole("link", { name: "Go to Library" });
}

function pixels(locator: Locator, property: "fontSize" | "lineHeight") {
  return locator.evaluate(
    (element, name) => parseFloat(getComputedStyle(element)[name]),
    property,
  );
}

test("explains that an address leads nowhere and shows it", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);

  await expect(
    page.getByRole("heading", { level: 1, name: "This page doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByText(MISSING_ADDRESS)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link"),
  ).toHaveCount(4);
});

test("lets the address of a missing page be selected", async ({ page }) => {
  await page.goto(MISSING_ADDRESS);

  const selected = await selectedByDoubleClick(
    page,
    page.getByText(MISSING_ADDRESS),
  );

  expect(selected.trim()).not.toBe("");
  expect(MISSING_ADDRESS).toContain(selected.trim());
});

test("leads back to the library from a missing page", async ({ page }) => {
  await page.goto(MISSING_ADDRESS);

  await page
    .getByRole("main")
    .getByRole("link", { name: "Go to Library" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
});

test("moves focus to the problem as it opens", async ({ page }) => {
  await page.goto(MISSING_ADDRESS);

  await expect(
    page.getByRole("heading", { level: 1, name: "This page doesn't exist" }),
  ).toBeFocused();
});

test("sets the problem lower on desktops, as the board does", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);
  test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "desktops only");

  const problem = await boxOf(
    page.getByRole("main").locator("section").locator(":scope > *").first(),
  );

  expect(problem.y).toBe(DESKTOP_PROBLEM_TOP);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a missing page has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(MISSING_ADDRESS);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test("sets the problem's title at 24px beside a round badge", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);
  const title = problemTitle(page);
  const badge = badgeOf(title);

  const titleBox = await boxOf(title);
  const badgeBox = await boxOf(badge);

  await expect(title).toHaveCSS("font-size", TITLE_SIZE);
  expect(await pixels(title, "lineHeight")).toBeCloseTo(TITLE_LINE_HEIGHT, 1);
  expect(badgeBox.x + badgeBox.width).toBeLessThan(titleBox.x);
  expect(badgeBox.y + badgeBox.height / 2).toBeCloseTo(
    titleBox.y + titleBox.height / 2,
    0,
  );
  await expect(badge).toHaveCSS("background-color", ACCENT_SOFT);
});

test("explains the problem in muted ink with its details on the well", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);

  const body = page.getByText("Nothing in your library has changed", {
    exact: false,
  });
  const detail = page.getByText(MISSING_ADDRESS);

  await expect(body).toHaveCSS("color", MUTED);
  await expect(body).toHaveCSS("opacity", "1");
  expect(
    (await pixels(body, "lineHeight")) / (await pixels(body, "fontSize")),
  ).toBeCloseTo(BODY_LINE_HEIGHT_RATIO, 1);
  await expect(detail).toHaveCSS("background-color", WELL);
  await expect(detail).toHaveCSS("border-top-left-radius", DETAIL_CORNER);
});

for (const platform of ["linux", "android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test.beforeEach(({ page }) => {
      test.skip(
        platform !== "linux" && viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "phones only",
      );
    });

    test("sizes the problem's badge, body and button for the platform", async ({
      page,
    }) => {
      const shape = SHAPES[platform];
      await page.goto(MISSING_ADDRESS);
      const badge = badgeOf(problemTitle(page));
      const body = page.getByText("Nothing in your library has changed", {
        exact: false,
      });

      const badgeBox = await boxOf(badge);
      const icon = await boxOf(badge.locator("svg"));
      const button = await boxOf(goToLibrary(page));
      const buttonCorner = await goToLibrary(page).evaluate(
        (element) => getComputedStyle(element).borderStartStartRadius,
      );

      expect(badgeBox.width).toBe(shape.badge);
      expect(icon.width).toBe(shape.icon);
      expect(await pixels(body, "fontSize")).toBe(shape.body);
      expect(button.height).toBe(shape.button);
      expect(Math.min(parseFloat(buttonCorner), button.height / 2)).toBe(
        shape.buttonCorner,
      );
    });
  });
}

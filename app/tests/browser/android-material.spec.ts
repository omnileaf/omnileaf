import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SERIES_COUNT = 12;
const NAVIGATION_BAR_HEIGHT = 80;
const TOP_APP_BAR_HEIGHT = 64;
const STATE_LAYER = /\/ 0\.08\)/;

testOnlyInItsWebview("android");
test.use({
  backend: {
    ...onPlatform("android").backend,
    librarySeries: pagedSeries(() => sampleSeries(SERIES_COUNT)),
    librarySeriesCount: () => SERIES_COUNT,
  },
});

function paintOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.backgroundColor} ${style.backgroundImage}`;
  });
}

function libraryHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Library" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(libraryHeading(page)).toBeVisible();
}

test("sets the interface in Roboto Flex, then Roboto, as Android does", async ({
  page,
}) => {
  await openLibrary(page);

  await expect(page.locator("body")).toHaveCSS(
    "font-family",
    /^"Roboto Flex", Roboto, /,
  );
});

test("sets a page's headline at regular weight, as Material 3 does", async ({
  page,
}) => {
  await openLibrary(page);

  await expect(libraryHeading(page)).toHaveCSS("font-weight", "400");
});

test("sets a phone's page title as title large, 22px on a 28px line in a 64px top app bar", async ({
  page,
}) => {
  await openLibrary(page);
  test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

  const heading = libraryHeading(page);

  await expect(heading).toHaveCSS("font-size", "22px");
  await expect(heading).toHaveCSS("line-height", "28px");
  expect((await boxOf(heading)).height).toBe(TOP_APP_BAR_HEIGHT);
});

test("puts the 80px navigation bar on the surface container, with the tonal pill behind the current section", async ({
  page,
}) => {
  await openLibrary(page);
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "wider screens list the sections in a rail or a drawer",
  );
  const navigation = page.getByRole("navigation", { name: "Main" });

  expect((await boxOf(navigation)).height).toBe(NAVIGATION_BAR_HEIGHT);
  await expect(navigation).toHaveCSS(
    "background-color",
    await tokenColour(page, "--android-container"),
  );
  await expect(
    navigation
      .getByRole("link", { name: "Library" })
      .locator('[data-slot="navigation-pill"]'),
  ).toHaveCSS("background-color", await tokenColour(page, "--android-tonal"));
});

test("labels the current section at 600 in the foreground and the others at 500 in the bar's ink", async ({
  page,
}) => {
  await openLibrary(page);
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "wider screens list the sections in a rail or a drawer",
  );
  const navigation = page.getByRole("navigation", { name: "Main" });

  const current = navigation.getByRole("link", { name: "Library" });
  const other = navigation.getByRole("link", { name: "Browse" });

  await expect(current).toHaveCSS("font-weight", "600");
  await expect(current).toHaveCSS(
    "color",
    await tokenColour(page, "--foreground"),
  );
  await expect(other).toHaveCSS("font-weight", "500");
  await expect(other).toHaveCSS(
    "color",
    await tokenColour(page, "--android-tab-ink"),
  );
});

test("lays a state layer in the control's own colour under the pointer, instead of a grey fill", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "touch screens have no pointer to hover with");
  await openLibrary(page);
  const filter = page.getByRole("button", { name: /^Sort and filter/ });

  await filter.hover();

  await expect.poll(() => paintOf(filter)).toMatch(STATE_LAYER);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations on Material 3 surfaces in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openLibrary(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

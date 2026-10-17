import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import {
  accessibilityViolations,
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  FAKE_APP_VERSION,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  LARGEST_TEXT_SCALE,
  setTextScale,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const COLOR_SCHEMES = ["light", "dark"] as const;
const SIDEBAR_WIDTHS = [840, 1024, 1200, 1280, 1440];
const BRAND_NAMES = { en: english.app_name, "en-XA": pseudo.app_name } as const;

const SECTIONS = [
  {
    label: "Library",
    path: "/",
    startFrom: "/browse",
    opensFirstSectionOnDesktop: false,
  },
  {
    label: "Browse",
    path: "/browse",
    startFrom: "/",
    opensFirstSectionOnDesktop: false,
  },
  {
    label: "History",
    path: "/history",
    startFrom: "/",
    opensFirstSectionOnDesktop: false,
  },
  {
    label: "Settings",
    path: "/settings",
    startFrom: "/",
    opensFirstSectionOnDesktop: true,
  },
] as const;

const OPENS_FIRST_SECTION =
  "settings opens its first section in a desktop window from 840px";

for (const { label, path, startFrom, opensFirstSectionOnDesktop } of SECTIONS) {
  test(`opens ${label} from the navigation and focuses its heading`, async ({
    page,
  }) => {
    test.skip(
      opensFirstSectionOnDesktop &&
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      OPENS_FIRST_SECTION,
    );
    await page.goto(startFrom);

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: label })
      .click();

    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeFocused();
    await expect(page.getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test(`focuses the ${label} heading without a focus ring when opened from the keyboard`, async ({
    page,
  }) => {
    test.skip(
      opensFirstSectionOnDesktop &&
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      OPENS_FIRST_SECTION,
    );
    await page.goto(startFrom);

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: label })
      .press("Enter");

    const heading = page.getByRole("heading", { level: 1, name: label });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS("outline-style", "none");
  });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`${label} has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      test.skip(
        opensFirstSectionOnDesktop &&
          viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        OPENS_FIRST_SECTION,
      );
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
}

test("puts the navigation at the bottom on phones and at the side from 600px", async ({
  page,
}) => {
  await page.goto("/");

  const navigation = await page
    .getByRole("navigation", { name: "Main" })
    .boundingBox();
  const main = await page.getByRole("main").boundingBox();
  const viewport = page.viewportSize();

  expect(navigation).not.toBeNull();
  expect(main).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (navigation === null || main === null || viewport === null) {
    return;
  }
  if (viewport.width < MEDIUM_MIN_WIDTH) {
    expect(navigation.y).toBeGreaterThanOrEqual(main.y + main.height);
    expect(navigation.y + navigation.height).toBeCloseTo(viewport.height, 0);
  } else {
    expect(navigation.x + navigation.width).toBeLessThanOrEqual(main.x);
    expect(navigation.height).toBeCloseTo(viewport.height, 0);
  }
});

test("shows the version the backend reports in Settings › About", async ({
  page,
}) => {
  await page.goto("/settings/about");

  await expect(page.getByText(`Version ${FAKE_APP_VERSION}`)).toBeVisible();
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test("goes back to Settings from a settings section", async ({ page }) => {
      await page.goto("/settings/about");
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "the section list stays beside the section on desktop",
      );

      await page.getByRole("link", { name: "Back to Settings" }).click();

      await expect(page).toHaveURL("/settings");
      await expect(
        page.getByRole("heading", { level: 1, name: "Settings" }),
      ).toBeFocused();
    });
  });
}

test("keeps Settings at the far end of the rail and the sidebar", async ({
  page,
}) => {
  await page.goto("/");
  test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "side navigation only");
  const navigation = page.getByRole("navigation", { name: "Main" });

  const bar = await boxOf(navigation);
  const history = await boxOf(
    navigation.getByRole("link", { name: "History" }),
  );
  const settings = await boxOf(
    navigation.getByRole("link", { name: "Settings" }),
  );

  expect(settings.y - (history.y + history.height)).toBeGreaterThan(
    bar.height / 2,
  );
});

for (const { platform, rowHeight, iconSize } of [
  { platform: "linux", rowHeight: 32, iconSize: 16 },
  { platform: "android", rowHeight: 48, iconSize: 22 },
] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test(`draws the sidebar's rows ${String(rowHeight)}px tall with ${String(iconSize)}px icons`, async ({
      page,
    }) => {
      await page.goto("/");
      test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "sidebar only");
      const library = page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Library" });

      const row = await boxOf(library);
      const icon = await boxOf(library.locator("svg"));

      expect(row.height).toBe(rowHeight);
      expect(icon.width).toBe(iconSize);
    });
  });
}

for (const [language, brand] of Object.entries(BRAND_NAMES)) {
  test(`keeps the sidebar's brand on one unbroken line with the largest text in ${language}`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "each engine sets every sidebar width itself, from the desktop",
    );
    await page.addInitScript((chosen) => {
      localStorage.setItem("omnileaf.language", chosen);
    }, language);
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await page.goto("/settings");
    const name = page.getByRole("navigation").getByText(brand, { exact: true });

    for (const width of SIDEBAR_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      const lines = await name.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set(
          [...range.getClientRects()].map(({ top }) => Math.round(top)),
        ).size;
      });
      expect(lines, `at ${String(width)}px`).toBe(1);
      expect(
        await sidewaysOverflow(page, "nav"),
        `at ${String(width)}px`,
      ).toEqual([]);
      await expect(name).toHaveAttribute("title", brand);
    }
  });
}

test("shows the whole brand in the sidebar with the largest text", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the sidebar shows from the desktop");
  await setTextScale(page, LARGEST_TEXT_SCALE);
  await page.setViewportSize({ width: EXPANDED_MIN_WIDTH, height: 900 });

  await page.goto("/settings");

  const name = page
    .getByRole("navigation")
    .getByText(english.app_name, { exact: true });
  expect(
    await name.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

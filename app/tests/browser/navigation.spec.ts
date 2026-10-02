import { AxeBuilder } from "@axe-core/playwright";

import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  FAKE_APP_VERSION,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const COLOR_SCHEMES = ["light", "dark"] as const;

const SECTIONS = [
  { label: "Library", path: "/", startFrom: "/settings" },
  { label: "Browse", path: "/browse", startFrom: "/" },
  { label: "History", path: "/history", startFrom: "/" },
  {
    label: "Settings",
    path: "/settings",
    startFrom: "/",
    onDesktop: { path: "/settings/library", heading: "Library" },
  },
] as const;

for (const section of SECTIONS) {
  const { label, path, startFrom } = section;

  test(`opens ${label} from the navigation and focuses its heading`, async ({
    page,
  }) => {
    await page.goto(startFrom);
    const isDesktop = viewportOf(page).width >= EXPANDED_MIN_WIDTH;
    const opened =
      isDesktop && "onDesktop" in section
        ? section.onDesktop
        : { path, heading: label };

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: label })
      .click();

    await expect(page).toHaveURL(opened.path);
    await expect(
      page.getByRole("heading", { level: 1, name: opened.heading }),
    ).toBeFocused();
    await expect(page.getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test(`focuses the ${label} heading without a focus ring when opened from the keyboard`, async ({
    page,
  }) => {
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
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
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

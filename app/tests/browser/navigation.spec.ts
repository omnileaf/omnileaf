import { AxeBuilder } from "@axe-core/playwright";

import {
  boxOf,
  expect,
  FAKE_APP_VERSION,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

const COLOR_SCHEMES = ["light", "dark"] as const;

const SECTIONS = [
  { label: "Library", path: "/", startFrom: "/settings" },
  { label: "Browse", path: "/browse", startFrom: "/" },
  { label: "History", path: "/history", startFrom: "/" },
  { label: "Settings", path: "/settings", startFrom: "/" },
] as const;

for (const { label, path, startFrom } of SECTIONS) {
  test(`opens ${label} from the navigation and focuses its heading`, async ({
    page,
  }) => {
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

  for (const colorScheme of COLOR_SCHEMES) {
    test(`${label} has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
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
  await page.goto("/settings");

  await page.getByRole("link", { name: "About" }).click();

  await expect(page.getByText(`Version ${FAKE_APP_VERSION}`)).toBeVisible();
});

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

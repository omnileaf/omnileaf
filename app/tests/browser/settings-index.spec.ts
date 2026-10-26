import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  EXPANDED_MIN_WIDTH,
  expect,
  FAKE_APP_VERSION,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const SUMMARIES = [
  { section: "Appearance", summary: "Follows the system" },
  { section: "Privacy", summary: "Screenshot mode off" },
  { section: "General", summary: "English · opens to Library" },
  { section: "Library", summary: "2 folders · 128 series" },
  { section: "Storage", summary: "1.4 GB used" },
  { section: "Advanced", summary: "Animations · Undo" },
  { section: "About", summary: `Version ${FAKE_APP_VERSION}` },
] as const;

const FOLDER = {
  kind: "linked",
  location: "/media/Comics",
  isAvailable: true,
} as const;

test.use({
  backend: {
    ...onPlatform("android").backend,
    libraryFolders: () => ({
      folders: [
        { ...FOLDER, id: "comics", name: "Comics" },
        { ...FOLDER, id: "manga", name: "Manga" },
      ],
      next: null,
    }),
    librarySeriesCount: () => 128,
  } satisfies FakeBackend,
});

test("summarises each section from what the app stores", async ({ page }) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );
  await page.goto("/settings");
  const main = page.getByRole("main");

  for (const { section, summary } of SUMMARIES) {
    await expect(
      main.getByRole("link", { name: new RegExp(`^${section}`) }),
    ).toContainText(summary);
  }
});

test("follows the light or dark choice in Appearance's summary", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );
  await page.goto("/settings/appearance");
  await page.getByRole("radio", { name: "Dark" }).click();

  await page.goto("/settings");

  await expect(
    page.getByRole("main").getByRole("link", { name: /^Appearance/ }),
  ).toContainText("Dark");
});

test("points each section's chevron toward the end of the line in a right-to-left language", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );
  await page.goto("/settings");
  const general = page
    .getByRole("main")
    .getByRole("link", { name: /^General/ });
  await expect(general).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  const chevron = general.locator("svg").last();

  await expect(chevron).toHaveCSS("scale", "-1 1");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the Settings list has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "settings opens its first section beside the list",
    );
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings");
    await expect(
      page.getByRole("main").getByRole("link", { name: /^About/ }),
    ).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

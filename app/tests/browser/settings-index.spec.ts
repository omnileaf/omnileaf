import type { FakeBackend } from "./fake-backend.ts";
import {
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
  await page.goto("/settings");
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );
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
  await page.goto("/settings/appearance");
  await page.getByRole("radio", { name: "Dark" }).click();

  await page.goto("/settings");
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );

  await expect(
    page.getByRole("main").getByRole("link", { name: /^Appearance/ }),
  ).toContainText("Dark");
});

test("points each section's chevron toward the end of the line in a right-to-left language", async ({
  page,
}) => {
  await page.goto("/settings");
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );
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

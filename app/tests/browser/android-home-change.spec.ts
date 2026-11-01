import {
  accessibilityViolations,
  boxOf,
  expect,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import {
  APP_STORAGE_HOME,
  homeRow,
  HOME_ROW,
  LONG_PICKED_LOCATION,
  PICKED_LOCATION,
  picker,
  pickingAHome,
} from "./home-picker.ts";

const TOUCH_TARGET = 48;
const HOME_HINT =
  "Progress, settings and backups live here. Tap the folder to move them.";

test.use({ backend: pickingAHome() });

test.beforeEach(({ platform }) => {
  test.skip(platform !== "android", "Android's folder picker");
  picker.reset();
});

test.describe(
  "changing the home folder in Settings > Library on an Android phone",
  { tag: "@native" },
  () => {
    test("makes the Home folder row the control, described by where the library lives", async ({
      page,
    }) => {
      await page.goto("/settings/library");

      await expect(homeRow(page)).toBeVisible();
      await expect(homeRow(page)).toHaveAccessibleDescription(
        APP_STORAGE_HOME.location,
      );
    });

    test("makes the whole row a 48px tall touch target, the Rescan button above it", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const section = page.getByRole("region", { name: HOME_ROW });
      const row = await boxOf(homeRow(page));
      const rescan = await boxOf(
        section.getByRole("button", { name: "Rescan Omnileaf" }),
      );

      expect(row.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
      expect(rescan.x).toBeGreaterThanOrEqual(row.x);
      await section.getByRole("button", { name: "Rescan Omnileaf" }).click();
      expect(picker.chooses).toBe(0);
    });

    test("offers no Change word button and no coming-soon control", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const section = page.getByRole("region", { name: HOME_ROW });

      await expect(section.getByRole("button", { name: "Change" })).toHaveCount(
        0,
      );
      await expect(page.getByText("coming soon")).toHaveCount(0);
    });

    test("tells where the tap leads, under the row", async ({ page }) => {
      await page.goto("/settings/library");

      await expect(page.getByText(HOME_HINT, { exact: true })).toBeVisible();
    });

    test("moves the library to the empty folder picked, naming where it is now", async ({
      page,
    }) => {
      picker.pickEmpty();
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();
      expect([picker.chooses, picker.moves]).toEqual([1, 1]);
    });

    test("reads the books of the folder it moved to and says so", async ({
      page,
    }) => {
      picker.pickEmpty();
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect(page.getByText("Rescanned Omnileaf.")).toBeVisible();
      await expect(page.getByText("12 books added")).toBeVisible();
      expect(picker.rescans).toEqual([APP_STORAGE_HOME.id]);
    });

    test("says the books couldn't be read when the rescan fails, with the home folder moved", async ({
      page,
    }) => {
      picker.failsToRescan = true;
      picker.pickEmpty();
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect(
        page.getByText("Couldn't rescan Omnileaf. Try again."),
      ).toBeVisible();
      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();
    });

    test("lists the old home folder under Folders when its books stay there", async ({
      page,
    }) => {
      picker.keepsOldHome = true;
      picker.pickEmpty();
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect(
        page
          .getByRole("listitem")
          .filter({ hasText: APP_STORAGE_HOME.location }),
      ).toBeVisible();
    });

    test("keeps the row from opening the picker again while the library moves", async ({
      page,
    }) => {
      picker.pickEmpty();
      const release = picker.holdMove();
      await page.goto("/settings/library");

      await homeRow(page).click();
      await expect.poll(() => picker.moves).toBe(1);

      await expect(homeRow(page)).toHaveAttribute("aria-disabled", "true");
      await homeRow(page).click({ force: true });
      expect(picker.chooses).toBe(1);
      release();
      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();
    });

    test("does nothing when the picker is closed without a folder", async ({
      page,
    }) => {
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect.poll(() => picker.chooses).toBe(1);
      expect([picker.moves, picker.rescans]).toEqual([0, []]);
      await expect(
        page.getByText(APP_STORAGE_HOME.location, { exact: true }),
      ).toBeVisible();
    });

    test("does nothing when the folder picked is the home folder already", async ({
      page,
    }) => {
      picker.picks.push({
        location: APP_STORAGE_HOME.location,
        choice: { kind: "current" },
      });
      await page.goto("/settings/library");

      await homeRow(page).click();

      await expect.poll(() => picker.chooses).toBe(1);
      expect(picker.moves).toBe(0);
    });

    test("warns that the folder can't be read, and offers another", async ({
      page,
    }) => {
      picker.pickUnreadable();
      picker.pickEmpty();
      await page.goto("/settings/library");

      await homeRow(page).click();
      await expect(
        page.getByText("Couldn't read that folder", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Choose another folder" }).click();

      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();
      expect(picker.moves).toBe(1);
    });

    test("keeps a long place inside the page", async ({ page }) => {
      picker.pickEmpty(LONG_PICKED_LOCATION);
      await page.goto("/settings/library");

      await homeRow(page).click();
      await expect(
        page.getByText(LONG_PICKED_LOCATION, { exact: true }),
      ).toBeVisible();

      expect(await sidewaysOverflow(page)).toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations once the library moved, in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        picker.pickEmpty();
        await page.goto("/settings/library");

        await homeRow(page).click();
        await expect(page.getByText("Rescanned Omnileaf.")).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

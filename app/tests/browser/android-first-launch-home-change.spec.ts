import {
  accessibilityViolations,
  boxOf,
  expect,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import {
  APP_STORAGE_HOME,
  FOUND_WHILE_READING,
  goToTheHomeStep,
  homeRow,
  LONG_PICKED_LOCATION,
  PICKED_LOCATION,
  picker,
  pickingAHome,
} from "./home-picker.ts";

const TOUCH_TARGET = 48;
const FIRST_LAUNCH_NOTE =
  "Tap the folder to choose another. Android’s picker opens in Documents.";

test.use({ backend: pickingAHome() });

test.beforeEach(({ platform }) => {
  test.skip(platform !== "android", "Android's folder picker");
  picker.reset();
});

test.describe(
  "changing the home folder on the first launch of an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(() => {
      picker.isFirstLaunch = true;
    });

    test("makes the Home folder row the control, with no Change word button", async ({
      page,
    }) => {
      await goToTheHomeStep(page);

      await expect(homeRow(page)).toHaveAccessibleDescription(
        APP_STORAGE_HOME.location,
      );
      await expect(page.getByRole("button", { name: "Change" })).toHaveCount(0);
      await expect(page.getByText("coming soon")).toHaveCount(0);
    });

    test("makes the whole Home folder row a 48px tall touch target", async ({
      page,
    }) => {
      await goToTheHomeStep(page);

      expect((await boxOf(homeRow(page))).height).toBeGreaterThanOrEqual(
        TOUCH_TARGET,
      );
    });

    test("says Android's picker opens in Documents", async ({ page }) => {
      await goToTheHomeStep(page);

      await expect(
        page.getByText(FIRST_LAUNCH_NOTE, { exact: true }),
      ).toBeVisible();
    });

    test("sets the note at 12 over 16", async ({ page }) => {
      await goToTheHomeStep(page);
      const note = page.getByText(FIRST_LAUNCH_NOTE, { exact: true });

      await expect(note).toHaveCSS("font-size", "12px");
      await expect(note).toHaveCSS("line-height", "16px");
    });

    test("moves the library to the empty folder picked and reads its books", async ({
      page,
    }) => {
      picker.pickEmpty();
      await goToTheHomeStep(page);

      await homeRow(page).click();

      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();
      await expect.poll(() => picker.rescans).toEqual([APP_STORAGE_HOME.id]);
    });

    test("counts the books found under the Home folder row while the moved home is read", async ({
      page,
    }) => {
      const finish = picker.holdRescan();
      picker.pickEmpty();
      await goToTheHomeStep(page);

      await homeRow(page).click();

      const counting = page.getByText(
        `Counting… ${String(FOUND_WHILE_READING)} so far`,
      );
      await expect(counting).toBeVisible();
      const place = await boxOf(
        page.getByText(PICKED_LOCATION, { exact: true }),
      );
      expect((await boxOf(counting)).y).toBeGreaterThanOrEqual(
        place.y + place.height,
      );
      finish();
      await expect(counting).toHaveCount(0);
    });

    test("stays on the step after the move, with Continue in reach", async ({
      page,
    }) => {
      picker.pickEmpty();
      await goToTheHomeStep(page);

      await homeRow(page).click();
      await expect(
        page.getByText(PICKED_LOCATION, { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByRole("button", { name: "Continue" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Where your library lives",
        }),
      ).toBeVisible();
    });

    test("warns that the books couldn't be read when the rescan fails", async ({
      page,
    }) => {
      picker.failsToRescan = true;
      picker.pickEmpty();
      await goToTheHomeStep(page);

      await homeRow(page).click();

      await expect(
        page.getByText("Couldn't rescan Omnileaf. Try again."),
      ).toBeVisible();
    });

    test("does nothing when the picker is closed without a folder", async ({
      page,
    }) => {
      await goToTheHomeStep(page);

      await homeRow(page).click();

      await expect.poll(() => picker.chooses).toBe(1);
      expect([picker.moves, picker.rescans]).toEqual([0, []]);
    });

    test("warns that the folder can't be read, and offers another", async ({
      page,
    }) => {
      picker.pickUnreadable();
      await goToTheHomeStep(page);

      await homeRow(page).click();

      await expect(
        page.getByText("Couldn't read that folder", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Choose another folder" }),
      ).toBeVisible();
      expect(picker.moves).toBe(0);
    });

    test("keeps a long place inside the page", async ({ page }) => {
      picker.pickEmpty(LONG_PICKED_LOCATION);
      await goToTheHomeStep(page);

      await homeRow(page).click();
      await expect(
        page.getByText(LONG_PICKED_LOCATION, { exact: true }),
      ).toBeVisible();

      expect(await sidewaysOverflow(page)).toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await goToTheHomeStep(page);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

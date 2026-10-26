import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const UNREADABLE_TITLE = "Couldn't read that folder";
const UNREADABLE =
  "Couldn't read that folder Omnileaf may not be allowed to open it, or it may have moved. Your library hasn't changed. Choose another folder";

const CORNER_INSET = 24;
const PHONE_INSET = 12;
const TOAST_WIDTH = 404;
const TITLE_SIZE = "14px";
const BODY_SIZE = "14px";
const ICON_SIZE = 20;
const POINTER_ACTION_HEIGHT = 24;
const POINTER_ACTION_RADIUS = 4;
const POINTER_ACTION_SIZE = "12px";
const POINTER_ACTION_WEIGHT = "500";
const ANDROID_ACTION_HEIGHT = 40;
const ANDROID_ACTION_SIZE = "14px";
const ANDROID_ACTION_WEIGHT = "500";
const ANDROID_ACTION_INK = "rgb(188, 249, 211)";
const IOS_BANNER_TOP = 54;
const IOS_BANNER_INSET = 8;
const ANDROID_SNACKBAR_INSET = 16;
const SWIPE_DISTANCE = 120;
const SWIPE_STEPS = 12;
const PHONE_NOTICES: Readonly<
  Partial<Record<Platform, { readonly fill: string; readonly corner: string }>>
> = {
  ios: { fill: "rgba(248, 248, 250, 0.85)", corner: "26px" },
  android: { fill: "rgb(11, 15, 12)", corner: "4px" },
};
const LONG_WAIT_MS = 60_000;
const NARROW_WINDOW = { width: 360, height: 800 };
const DESKTOP_PLATFORMS = ["linux", "macos", "windows"] as const;

const FAILS_TO_READ_THE_FOLDER: FakeBackend = {
  ...DEFAULT_BACKEND,
  addLibraryFolder: () => {
    throw new CommandFailure({
      code: "folderUnreadable",
      message: "the folder could not be read",
    });
  },
};

test.use({ backend: FAILS_TO_READ_THE_FOLDER });

function emptyLibraryAddFolder(page: Page) {
  return page
    .getByRole("region", { name: "Your library is empty" })
    .getByRole("button", { name: "Add a folder" });
}

function warningToast(page: Page): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: UNREADABLE_TITLE });
}

async function failToAddAFolder(page: Page) {
  await page.goto("/");
  await emptyLibraryAddFolder(page).click();
  const warning = warningToast(page);
  await expect(warning).toHaveText(UNREADABLE);
  await settle(warning);
  return { warning, card: warning.locator(":scope > div") };
}

function colourOf(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test("warns that the folder couldn't be read and offers another", async ({
  page,
}) => {
  const { warning } = await failToAddAFolder(page);

  await expect(
    warning.getByRole("button", { name: "Choose another folder" }),
  ).toBeVisible();
  await expect(warning).toHaveAttribute("aria-live", "assertive");
});

test("draws the warning in the warning colours", async ({ page }) => {
  const { card } = await failToAddAFolder(page);

  await expect(card).toHaveCSS(
    "background-color",
    await colourOf(page, "--color-warning-soft"),
  );
  await expect(card).toHaveCSS(
    "border-top-color",
    await colourOf(page, "--color-warning-edge"),
  );
  await expect(card).toHaveCSS(
    "color",
    await colourOf(page, "--color-on-warning"),
  );
});

test("keeps the warning until it's dismissed", async ({ page }) => {
  await page.clock.install();
  const { warning } = await failToAddAFolder(page);

  await page.clock.runFor(LONG_WAIT_MS);

  await expect(warning).toHaveAttribute("data-removed", "false");
});

test("shows the warning full width just above the navigation on phones", async ({
  page,
}) => {
  const viewport = viewportOf(page);
  test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
  const { card } = await failToAddAFolder(page);

  const box = await boxOf(card);
  const navigation = await boxOf(
    page.getByRole("navigation", { name: "Main" }),
  );

  expect(box.y + box.height).toBeLessThan(navigation.y);
  expect(box.x).toBe(PHONE_INSET);
  expect(viewport.width - (box.x + box.width)).toBe(PHONE_INSET);
});

test("shows the warning in the bottom corner on tablets and desktops", async ({
  page,
}) => {
  const viewport = viewportOf(page);
  test.skip(viewport.width < MEDIUM_MIN_WIDTH, "tablets and desktops only");
  const { card } = await failToAddAFolder(page);

  const box = await boxOf(card);

  expect(box.width).toBe(TOAST_WIDTH);
  expect(viewport.width - (box.x + box.width)).toBe(CORNER_INSET);
  expect(viewport.height - (box.y + box.height)).toBe(CORNER_INSET);
});

for (const platform of DESKTOP_PLATFORMS) {
  test.describe(`in a narrow desktop window on ${platform}`, () => {
    test.use({
      viewport: NARROW_WINDOW,
      backend: {
        ...FAILS_TO_READ_THE_FOLDER,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });
    test.skip(({ isMobile }) => isMobile, "only a desktop window narrows");

    test("fits the warning across the window with its words, action and dismiss inside", async ({
      page,
    }) => {
      const { card } = await failToAddAFolder(page);

      const box = await boxOf(card);
      const parts = [
        card.getByText(UNREADABLE_TITLE, { exact: true }),
        card.getByText(/^Omnileaf may not be allowed/),
        card.getByRole("button", { name: "Choose another folder" }),
        card.getByRole("button", { name: "Dismiss" }),
      ];

      expect(box.x).toBe(PHONE_INSET);
      expect(NARROW_WINDOW.width - (box.x + box.width)).toBe(PHONE_INSET);
      for (const part of parts) {
        const partBox = await boxOf(part);
        expect(partBox.x).toBeGreaterThanOrEqual(box.x);
        expect(partBox.x + partBox.width).toBeLessThanOrEqual(
          box.x + box.width,
        );
      }
    });
  });
}

test("reaches the warning from the keyboard after the page", async ({
  page,
}) => {
  const { warning } = await failToAddAFolder(page);
  await emptyLibraryAddFolder(page).focus();

  await page.keyboard.press("Tab");
  await expect(warning).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(warning.getByRole("button", { name: "Dismiss" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(warning).toHaveCount(0);
  await expect(emptyLibraryAddFolder(page)).toBeFocused();
});

test("jumps to the notifications with F6", async ({ page }) => {
  const { warning } = await failToAddAFolder(page);

  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");

  await expect(warning).toBeFocused();
});

test("puts the warning away when the page changes", async ({ page }) => {
  const { warning } = await failToAddAFolder(page);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Browse" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Browse" }),
  ).toBeFocused();
  await expect(warning).toHaveCount(0);
});

test("keeps the warning when the open section's link is pressed again", async ({
  page,
}) => {
  const { warning } = await failToAddAFolder(page);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Library" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
  await expect(warning).toHaveText(UNREADABLE);
});

test("slides into place", async ({ page }) => {
  await page.goto("/");

  await emptyLibraryAddFolder(page).click();

  await expect(warningToast(page)).not.toHaveCSS("transition-duration", "0s");
});

test("appears at once with reduce motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await emptyLibraryAddFolder(page).click();

  await expect(warningToast(page)).toBeVisible();
  await expect(warningToast(page)).toHaveCSS("transition-duration", "0s");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a warning has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await failToAddAFolder(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test("sets a 20px icon beside a 14px title over a 14px body on a desktop", async ({
  page,
}) => {
  const { card } = await failToAddAFolder(page);

  const icon = await boxOf(card.locator("svg").first());
  const title = card.getByText(UNREADABLE_TITLE, { exact: true });
  const body = card.getByText(/^Omnileaf may not be allowed/);

  expect([icon.width, icon.height]).toEqual([ICON_SIZE, ICON_SIZE]);
  expect(icon.x + icon.width).toBeLessThan((await boxOf(title)).x);
  await expect(title).toHaveCSS("font-size", TITLE_SIZE);
  await expect(body).toHaveCSS("font-size", BODY_SIZE);
});

test("draws the warning's action 24px tall with 4px corners on a desktop", async ({
  page,
}) => {
  const { card } = await failToAddAFolder(page);

  const action = card.getByRole("button", { name: "Choose another folder" });
  const box = await boxOf(action);

  expect(box.height).toBe(POINTER_ACTION_HEIGHT);
  await expect(action).toHaveCSS(
    "background-color",
    await colourOf(page, "--color-on-warning"),
  );
  await expect(action).toHaveCSS(
    "color",
    await colourOf(page, "--color-warning-soft"),
  );
  const radius = await action.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  expect(radius).toBe(POINTER_ACTION_RADIUS);
});

test("sets the warning's action in 12px medium type on a desktop", async ({
  page,
}) => {
  const { card } = await failToAddAFolder(page);

  const action = card.getByRole("button", { name: "Choose another folder" });

  await expect(action).toHaveCSS("font-size", POINTER_ACTION_SIZE);
  await expect(action).toHaveCSS("font-weight", POINTER_ACTION_WEIGHT);
});

test.describe("on Android", () => {
  testOnlyInItsWebview("android");
  test.use({
    backend: {
      ...FAILS_TO_READ_THE_FOLDER,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("sets the warning's title at 14px on a phone", async ({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    const { card } = await failToAddAFolder(page);

    const title = card.getByText(UNREADABLE_TITLE, { exact: true });

    await expect(title).toHaveCSS("font-size", TITLE_SIZE);
  });

  test("keeps the warning's action on one 40px line on a phone", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    const { card } = await failToAddAFolder(page);

    const action = card.getByRole("button", { name: "Choose another folder" });

    expect((await boxOf(action)).height).toBe(ANDROID_ACTION_HEIGHT);
  });

  test("draws the warning's action as the snackbar's 14px text action on a phone", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    const { card } = await failToAddAFolder(page);

    const action = card.getByRole("button", { name: "Choose another folder" });

    await expect(action).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(action).toHaveCSS("color", ANDROID_ACTION_INK);
    await expect(action).toHaveCSS("font-size", ANDROID_ACTION_SIZE);
    await expect(action).toHaveCSS("font-weight", ANDROID_ACTION_WEIGHT);
  });
});

test.describe("a notice on a phone", { tag: "@native" }, () => {
  test("drops the iOS banner from the top, under the top bar's buttons", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "iOS phones only");
    const { card } = await failToAddAFolder(page);

    const box = await boxOf(card);

    expect(box.y).toBe(IOS_BANNER_TOP);
    expect(box.x).toBe(IOS_BANNER_INSET);
    expect(viewportOf(page).width - (box.x + box.width)).toBe(IOS_BANNER_INSET);
  });

  test("swipes the iOS banner away upwards", async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS phones only");
    const { warning } = await failToAddAFolder(page);
    const box = await boxOf(warning.getByText(UNREADABLE_TITLE));
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y - SWIPE_DISTANCE, {
      steps: SWIPE_STEPS,
    });
    await page.mouse.up();

    await expect(warning).toHaveCount(0);
  });

  test("sets the Android snackbar above the navigation bar, 16px in from each side", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "android", "Android phones only");
    const { card } = await failToAddAFolder(page);

    const box = await boxOf(card);
    const navigation = await boxOf(
      page.getByRole("navigation", { name: "Main" }),
    );

    expect(box.y + box.height).toBeLessThan(navigation.y);
    expect(box.x).toBe(ANDROID_SNACKBAR_INSET);
    expect(viewportOf(page).width - (box.x + box.width)).toBe(
      ANDROID_SNACKBAR_INSET,
    );
  });

  test("draws the warning as the platform's own notice", async ({
    page,
    platform,
  }) => {
    const expected =
      platform === undefined ? undefined : PHONE_NOTICES[platform];
    test.skip(expected === undefined, "iOS and Android phones only");

    const { card } = await failToAddAFolder(page);

    await expect(card).toHaveCSS("background-color", expected?.fill ?? "");
    await expect(card).toHaveCSS(
      "border-top-left-radius",
      expected?.corner ?? "",
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });

      await failToAddAFolder(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

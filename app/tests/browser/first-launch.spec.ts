import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const HOME_FOLDER: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
  isAvailable: true,
};
const SAMPLE_COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};

/** A device that hasn't finished its first launch until the test finishes it. */
class Device {
  finishes = 0;
  failsToFinish = false;
  folders: WireFolder[] = [];

  reset(): void {
    this.finishes = 0;
    this.failsToFinish = false;
    this.folders = [HOME_FOLDER];
  }
}

const device = new Device();

const FIRST_LAUNCH_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  firstLaunchFinished: () => device.finishes > 0,
  finishFirstLaunch: () => {
    if (device.failsToFinish) {
      throw new CommandFailure({
        code: "internal",
        message: "something went wrong inside the app",
      });
    }
    device.finishes += 1;
    return null;
  },
  libraryFolders: () => ({ folders: [...device.folders], next: null }),
  addLibraryFolder: () => {
    device.folders.push(SAMPLE_COMICS);
    return {
      name: SAMPLE_COMICS.name,
      series: 3,
      books: 7,
      unreadableBooks: 0,
      unsupportedBooks: 0,
      unreadableFolders: 0,
    };
  },
};

const HOME_HEADING = "Where your library lives";
const IOS_HOME_HEADING = "Your backups and books are in Files";

const STEPS = [
  { heading: "Welcome to Omnileaf", leaveWith: "Get started" },
  { heading: HOME_HEADING, leaveWith: "Continue" },
  { heading: "Already have comics or books?", leaveWith: "Continue" },
  { heading: "A few choices", leaveWith: "Continue" },
  { heading: "You're all set", leaveWith: "Open my library" },
] as const;

function headingOn(platform: Platform, stepHeading: string): string {
  return platform === "ios" && stepHeading === HOME_HEADING
    ? IOS_HOME_HEADING
    : stepHeading;
}

test.use({ backend: FIRST_LAUNCH_BACKEND });

test.beforeEach(() => {
  device.reset();
});

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

async function goTo(
  page: Page,
  stepHeading: string,
  platform: Platform = "linux",
): Promise<void> {
  await page.goto("/first-launch");
  for (const step of STEPS) {
    const shown = headingOn(platform, step.heading);
    await expect(heading(page, shown)).toBeVisible();
    if (shown === stepHeading) {
      return;
    }
    await page.getByRole("button", { name: step.leaveWith }).click();
  }
}

const BADGE_BEFORE_TITLE =
  "xpath=preceding-sibling::*[1]/descendant-or-self::*[self::img or local-name()='svg'][1]";

function firstLineOf(title: Locator): Promise<{ top: number; bottom: number }> {
  return title.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const [line] = range.getClientRects();
    if (line === undefined) {
      throw new Error("the heading has no text");
    }
    return { top: line.top, bottom: line.bottom };
  });
}

for (const step of STEPS) {
  test(`sets the badge on the line of "${step.heading}", before it`, async ({
    page,
  }) => {
    await goTo(page, step.heading);
    await settle(page.getByRole("main"));
    const title = heading(page, step.heading);

    const badge = await boxOf(title.locator(BADGE_BEFORE_TITLE));
    const titleBox = await boxOf(title);
    const firstLine = await firstLineOf(title);

    const badgeMiddle = badge.y + badge.height / 2;
    expect(badgeMiddle).toBeGreaterThanOrEqual(firstLine.top);
    expect(badgeMiddle).toBeLessThanOrEqual(firstLine.bottom);
    expect(badge.x + badge.width).toBeLessThanOrEqual(titleBox.x);
  });
}

const BADGE_OF_TITLE = "xpath=preceding-sibling::*[1]/*[1]";
const BODY_OF_TITLE = "xpath=../following-sibling::p[1]";

const HEADER_SIZES = {
  onPhones: { badge: 40, title: 24, welcomeTitle: 28, body: 15 },
  fromMedium: { badge: 36, title: 24, welcomeTitle: 30, body: 14 },
} as const;

function fontSizeOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
}

for (const step of STEPS) {
  test(`sizes the badge, title and body of "${step.heading}" for the screen`, async ({
    page,
  }) => {
    const sizes =
      viewportOf(page).width < MEDIUM_MIN_WIDTH
        ? HEADER_SIZES.onPhones
        : HEADER_SIZES.fromMedium;
    const isWelcome = step.heading === STEPS[0].heading;
    await goTo(page, step.heading);
    const title = heading(page, step.heading);

    const badge = await boxOf(title.locator(BADGE_OF_TITLE));

    expect([badge.width, badge.height]).toEqual([sizes.badge, sizes.badge]);
    expect(await fontSizeOf(title)).toBe(
      isWelcome ? sizes.welcomeTitle : sizes.title,
    );
    expect(await fontSizeOf(title.locator(BODY_OF_TITLE))).toBe(sizes.body);
  });
}

interface ButtonShape {
  height: number;
  radius: number;
  fontSize: number;
}

function shapeOf(button: Locator): Promise<ButtonShape> {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      radius: Number.parseFloat(style.borderStartStartRadius),
      fontSize: Number.parseFloat(style.fontSize),
    };
  });
}

const DESKTOP_BUTTON = { height: 40, radius: 10, fontSize: 14 };
const TOUCH_PRIMARY_HEIGHT = 52;

test.describe("buttons on a desktop", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("linux").backend.appInfo,
    },
  });

  test("makes every step button 40px tall with 10px corners and 14px text", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?");
    const buttons = [
      page.getByRole("button", { name: "Continue" }),
      page.getByRole("button", { name: /^Skip/ }),
    ];
    if (viewportOf(page).width >= MEDIUM_MIN_WIDTH) {
      buttons.push(page.getByRole("button", { name: "Back" }).last());
    }

    const shapes = await Promise.all(buttons.map(shapeOf));

    expect(shapes).toEqual(buttons.map(() => DESKTOP_BUTTON));
  });
});

test.describe("buttons on android", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("makes the main step button a 52px pill", async ({ page }) => {
    await goTo(page, "Already have comics or books?");

    const shape = await shapeOf(page.getByRole("button", { name: "Continue" }));

    expect(shape.height).toBe(TOUCH_PRIMARY_HEIGHT);
    expect(shape.radius).toBeGreaterThanOrEqual(TOUCH_PRIMARY_HEIGHT / 2);
  });
});

test.describe("buttons on ios", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("ios").backend.appInfo,
    },
  });

  test("makes the main step button 52px tall with 14px corners", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?", "ios");

    const shape = await shapeOf(page.getByRole("button", { name: "Continue" }));

    expect([shape.height, shape.radius]).toEqual([TOUCH_PRIMARY_HEIGHT, 14]);
  });
});

test("goes through every step and opens the library once finished", async ({
  page,
}) => {
  await page.goto("/first-launch");

  for (const step of STEPS) {
    await expect(heading(page, step.heading)).toBeVisible();
    await page.getByRole("button", { name: step.leaveWith }).click();
  }

  await expect(page).toHaveURL("/");
  await expect(heading(page, "Library")).toBeFocused();
  expect(device.finishes).toBe(1);
});

test("opens on the first launch until the device has finished it", async ({
  page,
}) => {
  await page.goto("/settings");

  await expect(page).toHaveURL("/first-launch");
  await expect(heading(page, "Welcome to Omnileaf")).toBeVisible();
});

test("never shows the first launch again once it is finished", async ({
  page,
}) => {
  await goTo(page, "You're all set");
  await page.getByRole("button", { name: "Open my library" }).click();
  await expect(heading(page, "Library")).toBeVisible();

  await page.goto("/first-launch");

  await expect(page).toHaveURL("/");
  await expect(heading(page, "Library")).toBeVisible();
});

test("leaves the app when going back from the library it finished on", async ({
  page,
}) => {
  await goTo(page, "You're all set");
  await page.getByRole("button", { name: "Open my library" }).click();
  await expect(heading(page, "Library")).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL("about:blank");
});

test("focuses each step's heading as it moves on", async ({ page }) => {
  await goTo(page, "Welcome to Omnileaf");

  await page.getByRole("button", { name: "Get started" }).click();

  await expect(heading(page, "Where your library lives")).toBeFocused();
});

const MOBILE_WORDING = {
  onPhones: [
    "Your library stays on your phone.",
    "Your books and history stay on this phone unless you sync.",
  ],
  fromMedium: [
    "Your library stays on this device.",
    "Your books and history stay on this device unless you sync.",
  ],
};
const DESKTOP_PROMISES = [
  "Your library stays on this computer.",
  "No account. Your books and history stay here unless you sync.",
];

for (const { platform, wording } of [
  { platform: "android", wording: MOBILE_WORDING },
  { platform: "ios", wording: MOBILE_WORDING },
  {
    platform: "linux",
    wording: { onPhones: DESKTOP_PROMISES, fromMedium: DESKTOP_PROMISES },
  },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test("promises the library stays on the device it runs on", async ({
      page,
    }) => {
      const promises =
        viewportOf(page).width < MEDIUM_MIN_WIDTH
          ? wording.onPhones
          : wording.fromMedium;

      await page.goto("/first-launch");

      for (const promise of promises) {
        await expect(page.getByText(promise)).toBeVisible();
      }
    });
  });
}

test("sets the steps beside a shelf from 840px", async ({ page }) => {
  const isExpanded = viewportOf(page).width >= EXPANDED_MIN_WIDTH;

  await page.goto("/first-launch");

  await expect(
    page.getByText("Comics, manga, webtoons and books in one reader.", {
      exact: true,
    }),
  ).toBeVisible({ visible: isExpanded });
});

for (const platform of ["android", "linux"] as const) {
  test.describe(`the home folder on ${platform}`, () => {
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test("shows the path of the home folder the library lives in", async ({
      page,
    }) => {
      await goTo(page, HOME_HEADING, platform);

      await expect(page.getByText(HOME_FOLDER.location)).toBeVisible();
    });
  });
}

test.describe("the home folder on ios", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("ios").backend.appInfo,
    },
    userAgent: IPHONE_USER_AGENT,
  });

  test("names the folder backups and books go in as the Files app does, without its path", async ({
    page,
  }) => {
    const location = "On My iPhone › Omnileaf";

    await goTo(page, IOS_HOME_HEADING, "ios");

    await expect(page.getByText(location, { exact: true })).toBeVisible();
    await expect(page.getByText(HOME_FOLDER.location)).toHaveCount(0);
    await expect(
      page.getByText(
        "Omnileaf keeps your backups, and books you add, in its own folder in the Files app, so they're easy to copy or move. Your progress and categories stay safely inside the app.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/daily backups/)).toHaveCount(0);
  });

  test("leaves out the home folder's heading, as the board draws it", async ({
    page,
  }) => {
    await goTo(page, IOS_HOME_HEADING, "ios");

    await expect(
      page.getByRole("heading", { name: "Home folder" }),
    ).toHaveCount(0);
  });
});

test.describe("the home folder on an iPad", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("ios").backend.appInfo,
    },
    userAgent: IPAD_USER_AGENT,
  });

  test("names the folder backups and books go in as the Files app does, without its path", async ({
    page,
  }) => {
    const location = "On My iPad › Omnileaf";

    await goTo(page, IOS_HOME_HEADING, "ios");

    await expect(page.getByText(location, { exact: true })).toBeVisible();
    await expect(page.getByText(HOME_FOLDER.location)).toHaveCount(0);
    await expect(
      page.getByText(
        "Omnileaf keeps your backups, and books you add, in its own folder in the Files app, so they're easy to copy or move. Your progress and categories stay safely inside the app.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/daily backups/)).toHaveCount(0);
  });
});

test("counts the steps between the welcome and the end", async ({ page }) => {
  await goTo(page, "Where your library lives");

  const progress = page.getByRole("progressbar", { name: "Setting up" });

  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 3");
});

test("links a folder that already holds comics and lists it", async ({
  page,
}) => {
  await goTo(page, "Already have comics or books?");

  await page.getByRole("button", { name: "Add a folder" }).click();

  await expect(
    page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
  ).toHaveText(["Sample Comics /media/Sample Comics"]);
});

interface ControlLook {
  width: number;
  height: number;
  border: string;
  background: string;
  radius: number;
}

function lookOf(control: Locator): Promise<ControlLook> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      border: `${style.borderTopWidth} ${style.borderTopColor}`,
      background: style.backgroundColor,
      radius: Number.parseFloat(style.borderStartStartRadius),
    };
  });
}

function accentOf(page: Page): Promise<string> {
  return page
    .getByRole("button", { name: "Continue" })
    .evaluate((button) => getComputedStyle(button).backgroundColor);
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const PHONE_ADD_FOLDER_HEIGHT = 52;
const HAS_PHONE_CORNERS = {
  ios: (radius: number) => radius === 14,
  android: (radius: number) => radius >= PHONE_ADD_FOLDER_HEIGHT / 2,
} as const;

for (const platform of ["ios", "android"] as const) {
  test.describe(`first launch on an ${platform} phone`, () => {
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test.beforeEach(({ page }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      device.folders = [HOME_FOLDER, SAMPLE_COMICS];
    });

    test("puts a full-width outlined Add a folder under the folders, then the hint", async ({
      page,
    }) => {
      await goTo(page, "Already have comics or books?", platform);
      const folders = page.getByRole("region", { name: "Folders" });
      const add = folders.getByRole("button", { name: "Add a folder" });
      const hint = folders.getByText(/all work\.$/).filter({ visible: true });

      const list = await boxOf(folders.getByRole("list"));
      const button = await boxOf(add);
      const hintBox = await boxOf(hint);
      const look = await lookOf(add);

      expect(button.y).toBeGreaterThan(list.y + list.height);
      expect(hintBox.y).toBeGreaterThan(button.y + button.height);
      expect(look.width).toBe(list.width);
      expect(look.height).toBe(PHONE_ADD_FOLDER_HEIGHT);
      expect(look.border).toBe(`1px ${await accentOf(page)}`);
      expect(look.background).toBe(TRANSPARENT);
      expect(HAS_PHONE_CORNERS[platform](look.radius)).toBe(true);
    });

    test("names each choice in bold, then its control, then its help, with no card", async ({
      page,
    }) => {
      await goTo(page, "A few choices", platform);
      const choice = page.getByRole("region", { name: "Appearance" });
      const name = choice.getByRole("heading", { name: "Appearance" });
      const control = choice.getByRole("radiogroup", { name: "Appearance" });
      const help = choice.getByText(
        "Paper light or dark, or follow your phone.",
      );

      const nameBox = await boxOf(name);
      const controlBox = await boxOf(control);
      const helpBox = await boxOf(help);
      const nameStyle = await name.evaluate((element) => {
        const style = getComputedStyle(element);
        return { size: style.fontSize, weight: style.fontWeight };
      });
      const card = await lookOf(choice);

      expect(controlBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
      expect(helpBox.y).toBeGreaterThan(controlBox.y + controlBox.height);
      expect(nameStyle).toEqual({ size: "14px", weight: "700" });
      expect(card.background).toBe(TRANSPARENT);
      expect(card.border.startsWith("0px")).toBe(true);
    });
  });
}

test("skips linking folders for now", async ({ page }) => {
  await goTo(page, "Already have comics or books?");

  await page.getByRole("button", { name: /^Skip/ }).click();

  await expect(heading(page, "A few choices")).toBeFocused();
  expect(device.folders).toEqual([HOME_FOLDER]);
});

const IOS_LINK_HINT =
  "Folders in Files, iCloud Drive or a connected drive all work.";
const DESKTOP_LINK_HINT =
  "Folders on this computer, external drives and network shares all work.";

for (const { platform, hint } of [
  {
    platform: "android",
    hint: {
      onPhones: "Folders on your phone, an SD card or a USB drive all work.",
      fromMedium: "Folders on this device, an SD card or a USB drive all work.",
    },
  },
  {
    platform: "ios",
    hint: { onPhones: IOS_LINK_HINT, fromMedium: IOS_LINK_HINT },
  },
  {
    platform: "linux",
    hint: { onPhones: DESKTOP_LINK_HINT, fromMedium: DESKTOP_LINK_HINT },
  },
] as const) {
  test.describe(`linking on ${platform}`, () => {
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test("says which folders can be linked on the device", async ({ page }) => {
      const expected =
        viewportOf(page).width < MEDIUM_MIN_WIDTH
          ? hint.onPhones
          : hint.fromMedium;

      await goTo(page, "Already have comics or books?", platform);

      await expect(page.getByText(expected)).toBeVisible();
    });
  });
}

test.describe("on android", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("explains the appearance choice in the device's words", async ({
    page,
  }) => {
    const help =
      viewportOf(page).width < MEDIUM_MIN_WIDTH
        ? "Paper light or dark, or follow your phone."
        : "Paper light or dark, or follow this device.";

    await goTo(page, "A few choices");

    await expect(
      page.getByRole("radiogroup", { name: "Appearance" }),
    ).toHaveAccessibleDescription(help);
  });
});

test("turns the app dark from the choices", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await goTo(page, "A few choices");

  await page
    .getByRole("radiogroup", { name: "Appearance" })
    .locator("label")
    .filter({ hasText: "Dark" })
    .click();

  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("goes back a step with the Back button", async ({ page }) => {
  await goTo(page, "Where your library lives");

  await page.getByRole("button", { name: "Back" }).click();

  await expect(heading(page, "Welcome to Omnileaf")).toBeFocused();
});

test("goes back a step with the browser's back", async ({ page }) => {
  await goTo(page, "Where your library lives");

  await page.goBack();

  await expect(heading(page, "Welcome to Omnileaf")).toBeVisible();
});

test("stays on the last step and says so when finishing fails", async ({
  page,
}) => {
  device.failsToFinish = true;
  await goTo(page, "You're all set");

  await page.getByRole("button", { name: "Open my library" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Couldn't finish setting up. Try again.",
  );
  await expect(page).toHaveURL("/first-launch");
});

test("puts the Back button above the step on phones and beside its actions from 600px", async ({
  page,
}) => {
  await goTo(page, "Where your library lives");

  const back = page.getByRole("button", { name: "Back" });
  const next = page.getByRole("button", { name: "Continue" });
  const isPhone = viewportOf(page).width < MEDIUM_MIN_WIDTH;

  const backBox = await back.boundingBox();
  const nextBox = await next.boundingBox();
  const backIsAbove =
    backBox !== null && nextBox !== null && backBox.y < nextBox.y;
  expect(backIsAbove).toBe(isPhone);
});

function transitionsIn(locator: Locator): Promise<string[]> {
  return locator.evaluate((root) =>
    [...root.querySelectorAll("*")]
      .map((element) => getComputedStyle(element).transitionDuration)
      .filter((duration) => duration !== "0s"),
  );
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`moves the progress dots only without reduce motion (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await goTo(page, "Where your library lives");

    const transitions = await transitionsIn(
      page.getByRole("progressbar", { name: "Setting up" }),
    );

    expect(transitions.length > 0).toBe(reducedMotion === "no-preference");
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const step of STEPS) {
    test(`${step.heading} has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await goTo(page, step.heading);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
}

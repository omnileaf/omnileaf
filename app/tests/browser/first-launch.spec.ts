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
  testOnlyInItsWebview,
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

    const shapes = await Promise.all(buttons.map(shapeOf));

    expect(shapes).toEqual(buttons.map(() => DESKTOP_BUTTON));
  });
});

test.describe("buttons on android", () => {
  testOnlyInItsWebview("android");
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
  testOnlyInItsWebview("ios");
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
    testOnlyInItsWebview(platform);
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
    testOnlyInItsWebview(platform);
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
  testOnlyInItsWebview("ios");
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
  testOnlyInItsWebview("ios");
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

  const steps = page.getByRole("list", { name: "Setting up" });

  for (const name of [
    "Home folder, step 1 of 3",
    "Your folders, step 2 of 3",
    "Choices, step 3 of 3",
  ]) {
    await expect(
      steps.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(steps.locator('[aria-current="step"]')).toHaveAccessibleName(
    "Home folder, step 1 of 3",
  );
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
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      background: style.backgroundColor,
      radius: Number.parseFloat(style.borderStartStartRadius),
    };
  });
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const LONG_ADD_FOLDER_HEIGHT = 56;
const HAS_PHONE_CORNERS = {
  ios: (radius: number) => radius === 14,
  android: (radius: number) => radius >= LONG_ADD_FOLDER_HEIGHT / 2,
} as const;

test("draws Add a folder as one long dashed accent button with a plus", async ({
  page,
}) => {
  await goTo(page, "Already have comics or books?");
  const add = page
    .getByRole("region", { name: "Folders" })
    .getByRole("button", { name: "Add a folder" });

  const look = await lookOf(add);

  expect(look.height).toBe(LONG_ADD_FOLDER_HEIGHT);
  expect(look.border).toBe(
    `1px dashed ${await colorOf(page, "--color-accent")}`,
  );
  expect(look.background).toBe(await colorOf(page, "--color-accent-soft"));
  await expect(add.locator("svg")).toHaveCount(1);
});

for (const platform of ["ios", "android"] as const) {
  test.describe(`first launch on an ${platform} phone`, () => {
    testOnlyInItsWebview(platform);
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

    test("puts a full-width Add a folder under the folders, then the hint", async ({
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
    testOnlyInItsWebview(platform);
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
  testOnlyInItsWebview("android");
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
    .getByRole("radio", { name: "Dark" })
    .click();

  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

function stepNamed(page: Page, name: string): Locator {
  return page
    .getByRole("list", { name: "Setting up" })
    .getByRole("button", { name });
}

test("goes back to a finished step when it is tapped", async ({ page }) => {
  await goTo(page, "A few choices");

  await stepNamed(page, "Home folder, step 1 of 3").click();

  await expect(heading(page, HOME_HEADING)).toBeFocused();
});

test("goes back from a tapped step the way it came", async ({ page }) => {
  await goTo(page, "A few choices");
  await stepNamed(page, "Home folder, step 1 of 3").click();
  await expect(heading(page, HOME_HEADING)).toBeVisible();

  await page.goBack();

  await expect(heading(page, "Welcome to Omnileaf")).toBeVisible();
});

test("keeps the steps ahead from being chosen yet", async ({ page }) => {
  await goTo(page, "Where your library lives");
  const ahead = stepNamed(page, "Choices, step 3 of 3");

  await ahead.click({ force: true });

  await expect(ahead).toHaveAttribute("aria-disabled", "true");
  await expect(heading(page, HOME_HEADING)).toBeVisible();
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

test("heads the step with the steps and leaves out a Back button", async ({
  page,
}) => {
  await goTo(page, "Already have comics or books?");

  const steps = await boxOf(page.getByRole("list", { name: "Setting up" }));
  const title = await boxOf(heading(page, "Already have comics or books?"));

  expect(steps.y + steps.height).toBeLessThanOrEqual(title.y);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
});

function circleOf(step: Locator): Locator {
  return step.locator("xpath=*[1]");
}

function lineAfter(step: Locator): Locator {
  return step.locator("xpath=following-sibling::*[last()]");
}

function lineBefore(step: Locator): Locator {
  return step.locator("xpath=following-sibling::*[1]");
}

function lineColor(line: Locator): Promise<string> {
  return line.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function colorOf(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

interface StepLook {
  size: number;
  fill: string;
  ring: string;
  hasCheck: boolean;
  number: string;
  nameWeight: string;
}

async function lookOfStep(step: Locator): Promise<StepLook> {
  await settle(step);
  return step.evaluate((button) => {
    const [circle, name] = [...button.children];
    if (circle === undefined || name === undefined) {
      throw new Error("the step has no circle and name");
    }
    const circleStyle = getComputedStyle(circle);
    return {
      size: circle.getBoundingClientRect().width,
      fill: circleStyle.backgroundColor,
      ring: circleStyle.boxShadow,
      hasCheck: circle.querySelector("svg") !== null,
      number: circle.textContent.trim(),
      nameWeight: getComputedStyle(name).fontWeight,
    };
  });
}

test("checks the finished steps and fills the line after each with the accent", async ({
  page,
}) => {
  await goTo(page, "A few choices");
  const accent = await colorOf(page, "--color-accent");
  const home = stepNamed(page, "Home folder, step 1 of 3");
  const folders = stepNamed(page, "Your folders, step 2 of 3");
  const choices = stepNamed(page, "Choices, step 3 of 3");

  const looks = await Promise.all([home, folders].map(lookOfStep));
  const lines = await Promise.all(
    [
      lineAfter(home),
      lineBefore(folders),
      lineAfter(folders),
      lineBefore(choices),
    ].map(lineColor),
  );

  expect(looks.map((look) => [look.hasCheck, look.fill])).toEqual([
    [true, accent],
    [true, accent],
  ]);
  expect(lines).toEqual([accent, accent, accent, accent]);
});

test("fills the current step with the accent, rings it softly and names it in bold", async ({
  page,
}) => {
  await goTo(page, "Already have comics or books?");
  const current = stepNamed(page, "Your folders, step 2 of 3");
  const accent = await colorOf(page, "--color-accent");
  const softAccent = await colorOf(page, "--color-accent-soft");

  const look = await lookOfStep(current);

  await expect(current).toHaveAttribute("aria-current", "step");
  expect(look).toMatchObject({
    size: 28,
    fill: accent,
    hasCheck: false,
    number: "2",
    nameWeight: "700",
  });
  expect(look.ring).toContain(softAccent);
});

test("greys the steps ahead and the line before them", async ({ page }) => {
  await goTo(page, "Already have comics or books?");
  const current = stepNamed(page, "Your folders, step 2 of 3");
  const ahead = stepNamed(page, "Choices, step 3 of 3");
  const grey = await colorOf(page, "--color-step-off");

  const look = await lookOfStep(ahead);
  const lines = await Promise.all(
    [lineAfter(current), lineBefore(ahead)].map((line) =>
      line.evaluate((element) => ({
        color: getComputedStyle(element).backgroundColor,
        thickness: element.getBoundingClientRect().height,
      })),
    ),
  );

  expect([look.size, look.fill, look.number]).toEqual([28, grey, "3"]);
  expect(lines).toEqual([
    { color: grey, thickness: 4 },
    { color: grey, thickness: 4 },
  ]);
});

test("names each step under its circle", async ({ page }) => {
  await goTo(page, "Already have comics or books?");
  const current = stepNamed(page, "Your folders, step 2 of 3");

  const circle = await boxOf(circleOf(current));
  const name = await boxOf(current.getByText("Your folders"));

  expect(name.y).toBeGreaterThanOrEqual(circle.y + circle.height);
  expect(
    Math.abs(name.x + name.width / 2 - (circle.x + circle.width / 2)),
  ).toBeLessThan(1);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`grows the current step's circle in only without reduce motion (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await goTo(page, "Where your library lives");

    const animation = await circleOf(
      stepNamed(page, "Home folder, step 1 of 3"),
    ).evaluate((circle) => getComputedStyle(circle).animationName);

    expect(animation).toBe(
      reducedMotion === "no-preference" ? "step-grow" : "none",
    );
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

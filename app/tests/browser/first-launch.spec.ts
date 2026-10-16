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

const BADGE_OF_TITLE =
  "xpath=preceding-sibling::*[1]/descendant-or-self::*[self::img or self::span][1]";
const BODY_OF_TITLE = "xpath=following-sibling::p[1]";

const MIDDLE_STEPS = STEPS.slice(1, -1);
const OPEN_STEPS = [STEPS[0], STEPS[4]];

function centreOf(box: { x: number; width: number }): number {
  return box.x + box.width / 2;
}

for (const step of STEPS) {
  test(`centres the badge above "${step.heading}" and its words under it`, async ({
    page,
  }) => {
    await goTo(page, step.heading);
    await settle(page.getByRole("main"));
    const title = heading(page, step.heading);

    const badge = await boxOf(title.locator(BADGE_OF_TITLE));
    const titleBox = await boxOf(title);
    const body = await boxOf(title.locator(BODY_OF_TITLE));

    expect(badge.y + badge.height).toBeLessThanOrEqual(titleBox.y);
    expect(body.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    expect(Math.abs(centreOf(badge) - centreOf(titleBox))).toBeLessThan(1);
    await expect(title).toHaveCSS("text-align", "center");
    await expect(title.locator(BODY_OF_TITLE)).toHaveCSS(
      "text-align",
      "center",
    );
  });
}

const HEADER_SIZES = {
  badge: 56,
  appIcon: 72,
  title: 24,
  welcomeTitle: 28,
  body: 16,
};

function fontSizeOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
}

for (const step of STEPS) {
  test(`sizes the badge, title and body of "${step.heading}" as drawn`, async ({
    page,
  }) => {
    const isWelcome = step.heading === STEPS[0].heading;
    await goTo(page, step.heading);
    const title = heading(page, step.heading);

    const badge = await boxOf(title.locator(BADGE_OF_TITLE));

    const side = isWelcome ? HEADER_SIZES.appIcon : HEADER_SIZES.badge;
    expect([badge.width, badge.height]).toEqual([side, side]);
    expect(await fontSizeOf(title)).toBe(
      isWelcome ? HEADER_SIZES.welcomeTitle : HEADER_SIZES.title,
    );
    expect(await fontSizeOf(title.locator(BODY_OF_TITLE))).toBe(
      HEADER_SIZES.body,
    );
  });
}

const TITLE_TRACKING = -0.01;

for (const step of [STEPS[0], STEPS[1]]) {
  test(`tightens the letters of "${step.heading}" as drawn`, async ({
    page,
  }) => {
    await goTo(page, step.heading);
    const title = heading(page, step.heading);

    const { size, tracking } = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        size: Number.parseFloat(style.fontSize),
        tracking: style.letterSpacing,
      };
    });

    expect(tracking).toBe(`${String(TITLE_TRACKING * size)}px`);
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

test("sets the steps in a 600px dialog over the window from 840px", async ({
  page,
}) => {
  const isExpanded = viewportOf(page).width >= EXPANDED_MIN_WIDTH;

  await goTo(page, HOME_HEADING);
  const dialog = page.getByRole("main").locator("xpath=..");
  const box = await boxOf(dialog);

  expect(box.width).toBe(Math.min(viewportOf(page).width, 600));
  expect(centreOf(box)).toBe(viewportOf(page).width / 2);
  await expect(dialog).toHaveCSS(
    "border-top-width",
    isExpanded ? "1px" : "0px",
  );
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

for (const [index, step] of MIDDLE_STEPS.entries()) {
  test(`says "${step.heading}" is step ${String(index + 1)} of 3 with three dots`, async ({
    page,
  }) => {
    await goTo(page, step.heading);
    const progress = page.getByRole("progressbar", { name: "Setting up" });

    await expect(progress).toHaveAttribute("aria-valuenow", String(index + 1));
    await expect(progress).toHaveAttribute("aria-valuemax", "3");
    await expect(progress).toHaveAttribute(
      "aria-valuetext",
      `${String(index + 1)} of 3`,
    );
    await expect(progress).toContainText(`${String(index + 1)} of 3`);
    expect(await dotWidths(progress)).toEqual(
      [6, 6, 6].map((width, dot) => (dot === index ? 22 : width)),
    );
  });
}

function dotWidths(progress: Locator): Promise<number[]> {
  return progress
    .locator("xpath=*[1]/*")
    .evaluateAll((dots) =>
      dots.map((dot) => dot.getBoundingClientRect().width),
    );
}

for (const step of OPEN_STEPS) {
  test(`leaves "${step.heading}" without Back or the dots`, async ({
    page,
  }) => {
    await goTo(page, step.heading);

    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  });
}

test("goes back a step with Back", async ({ page }) => {
  await goTo(page, "A few choices");

  await page.getByRole("button", { name: "Back" }).click();

  await expect(heading(page, "Already have comics or books?")).toBeFocused();
});

test("puts Back above the title on a phone and at the foot of the dialog from 840px", async ({
  page,
}) => {
  const isExpanded = viewportOf(page).width >= EXPANDED_MIN_WIDTH;
  await goTo(page, "Already have comics or books?");

  const back = await boxOf(page.getByRole("button", { name: "Back" }));
  const title = await boxOf(heading(page, "Already have comics or books?"));
  const next = await boxOf(page.getByRole("button", { name: "Continue" }));

  if (isExpanded) {
    expect(back.y + back.height / 2).toBe(next.y + next.height / 2);
    expect(back.x + back.width).toBeLessThan(next.x);
  } else {
    expect(back.y + back.height).toBeLessThanOrEqual(title.y);
  }
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

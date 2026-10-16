import type { Locator, Page } from "@playwright/test";
import { TauriEvent } from "@tauri-apps/api/event";

import type { AdultContent, Platform } from "../../src/lib/ipc/bindings.ts";
import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  expect,
  LARGEST_TEXT_SCALE,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  setTextScale,
  settle,
  sidewaysOverflow,
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
const MANGA: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Manga",
  location: "/media/usb/Manga",
  isAvailable: true,
};
const FOUND_HEADING = "Found 35 series and 45 books";
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
  books = new Map<string, number>();
  series = new Map<string, number>();
  shelf: WireSeries[] = [];
  adultContent: AdultContent = { treatment: "show", countsAgeRatings: false };

  reset(): void {
    this.finishes = 0;
    this.failsToFinish = false;
    this.folders = [HOME_FOLDER];
    this.books = new Map();
    this.series = new Map();
    this.shelf = [];
    this.adultContent = { treatment: "show", countsAgeRatings: false };
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
  libraryFolderBookCount: (id) => device.books.get(id) ?? 0,
  folderSeriesCount: (id) => device.series.get(id) ?? 0,
  librarySeries: () => ({ series: device.shelf, next: null }),
  libraryAdultContent: () => device.adultContent,
  setLibraryAdultContent: (content) => {
    device.adultContent = content;
    return null;
  },
  addLibraryFolder: () => {
    device.folders.push(SAMPLE_COMICS);
    device.books.set(SAMPLE_COMICS.id, 7);
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
const LINK_HINT_ON_A_COMPUTER =
  "Folders on this computer, external drives and network shares all work.";
const EMPTY_READY_HEADING = "Your library is empty for now";
const IOS_HOME_HEADING = "Your backups and books are in Files";

const STEPS = [
  { heading: "Welcome to Omnileaf", leaveWith: "Get started" },
  { heading: HOME_HEADING, leaveWith: "Continue" },
  { heading: "Already have comics or books?", leaveWith: /^Skip/ },
  { heading: "A few choices", leaveWith: "Continue" },
  { heading: EMPTY_READY_HEADING, leaveWith: "Open my library" },
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
    const shown =
      step === STEPS[4] ? stepHeading : headingOn(platform, step.heading);
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
  mark: 72,
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

    const isReady = step === STEPS[4];
    const side = isWelcome || isReady ? HEADER_SIZES.mark : HEADER_SIZES.badge;
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

test("ends the folders with their hint, leaving no room for a notice that isn't there", async ({
  page,
}) => {
  await goTo(page, "Already have comics or books?");
  const folders = page.getByRole("region", { name: "Folders" });

  const [area, hint] = await Promise.all([
    boxOf(folders),
    boxOf(folders.getByText(LINK_HINT_ON_A_COMPUTER)),
  ]);

  expect(area.y + area.height).toBeCloseTo(hint.y + hint.height, 0);
});

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
const TOUCH_BUTTON_TEXT = 16;
const LARGE_TEXT_SCALE = 1.3;

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
    device.folders = [HOME_FOLDER, SAMPLE_COMICS];
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
    device.folders = [HOME_FOLDER, SAMPLE_COMICS];
    await goTo(page, "Already have comics or books?");

    const shape = await shapeOf(page.getByRole("button", { name: "Continue" }));

    expect(shape.height).toBe(TOUCH_PRIMARY_HEIGHT);
    expect(shape.radius).toBeGreaterThanOrEqual(TOUCH_PRIMARY_HEIGHT / 2);
  });

  test("grows the step buttons' words with the text size", async ({ page }) => {
    device.folders = [HOME_FOLDER, SAMPLE_COMICS];
    await setTextScale(page, LARGE_TEXT_SCALE);
    await goTo(page, "Already have comics or books?");

    const shapes = await Promise.all(
      [
        page.getByRole("button", { name: "Continue" }),
        page.getByRole("button", { name: /^Skip/ }),
      ].map(shapeOf),
    );

    expect(shapes.map(({ fontSize }) => fontSize)).toEqual([
      TOUCH_BUTTON_TEXT * LARGE_TEXT_SCALE,
      TOUCH_BUTTON_TEXT * LARGE_TEXT_SCALE,
    ]);
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
    device.folders = [HOME_FOLDER, SAMPLE_COMICS];
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
  await goTo(page, EMPTY_READY_HEADING);
  await page.getByRole("button", { name: "Open my library" }).click();
  await expect(heading(page, "Library")).toBeVisible();

  await page.goto("/first-launch");

  await expect(page).toHaveURL("/");
  await expect(heading(page, "Library")).toBeVisible();
});

test("leaves the app when going back from the library it finished on", async ({
  page,
}) => {
  await goTo(page, EMPTY_READY_HEADING);
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

    test("keeps the home folder in one card, its path in a code block over what it keeps", async ({
      page,
    }) => {
      await goTo(page, HOME_HEADING, platform);
      const card = page.getByRole("region", { name: "Home folder" });

      await expect(card.locator("code")).toHaveText(HOME_FOLDER.location);
      expect(await factsOf(card)).toEqual(HOME_FACTS);
    });
  });
}

const HOME_FACTS = [
  ["Keeps", "Progress, categories and backups"],
  ["Also holds", "Books you download or import"],
  ["Your comics", "Stay where they are"],
];
const IOS_HOME_FACTS = [
  ["Keeps", "Backups, and books you add"],
  ["In the app", "Progress and categories, kept safe"],
  ["Your comics", "Stay where they are"],
];
const LONG_HOME_LOCATION =
  "/mnt/nas/shared/reading/comics-and-books/Omnileaf library";

function factsOf(card: Locator): Promise<string[][]> {
  return card
    .locator("dl > div")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.children].map((cell) => cell.textContent.trim()),
      ),
    );
}

const HOME_TERM_WIDTH = 88;
const HOME_NAME_TEXT = 16;

test("sets what the home folder keeps beside an 88px column of names", async ({
  page,
}) => {
  await goTo(page, HOME_HEADING);
  const terms = page.getByRole("region", { name: "Home folder" }).locator("dt");

  const widths = await terms.evaluateAll((cells) =>
    cells.map((cell) => cell.getBoundingClientRect().width),
  );

  expect(widths).toEqual(HOME_FACTS.map(() => HOME_TERM_WIDTH));
});

test("grows the home folder's name with the text size", async ({ page }) => {
  await setTextScale(page, LARGE_TEXT_SCALE);
  await goTo(page, HOME_HEADING);

  const name = page
    .getByRole("region", { name: "Home folder" })
    .getByRole("heading", { name: "Home folder" });

  expect(await fontSizeOf(name)).toBeCloseTo(HOME_NAME_TEXT * LARGE_TEXT_SCALE);
});

test("wraps a long home folder path inside its code block", async ({
  page,
}) => {
  device.folders = [{ ...HOME_FOLDER, location: LONG_HOME_LOCATION }];
  await goTo(page, HOME_HEADING);
  const card = page.getByRole("region", { name: "Home folder" });

  const cardBox = await boxOf(card);
  const code = await boxOf(card.locator("code"));

  expect(code.x + code.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  await expect(card.locator("code")).toHaveCSS("white-space", "pre-wrap");
  await expect(card.locator("code")).toHaveCSS("overflow-wrap", "anywhere");
});

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
    const card = page.getByRole("region", { name: "In Files" });

    await expect(card.locator("code")).toHaveText(location);
    await expect(page.getByText(HOME_FOLDER.location)).toHaveCount(0);
    await expect(
      page.getByText(
        "Omnileaf keeps its own folder in the Files app, so your backups and books are easy to copy or move.",
      ),
    ).toBeVisible();
    expect(await factsOf(card)).toEqual(IOS_HOME_FACTS);
  });

  test("leaves out the home folder's heading, as the board draws it", async ({
    page,
  }) => {
    await goTo(page, IOS_HOME_HEADING, "ios");

    await expect(
      page.getByRole("heading", { name: "Home folder" }),
    ).toHaveCount(0);
  });

  test("wraps what the folder keeps inside its card at the largest text", async ({
    page,
  }) => {
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await goTo(page, IOS_HOME_HEADING, "ios");

    expect(await sidewaysOverflow(page)).toEqual([]);
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
    const card = page.getByRole("region", { name: "In Files" });

    await expect(card.locator("code")).toHaveText(location);
    await expect(page.getByText(HOME_FOLDER.location)).toHaveCount(0);
    await expect(
      page.getByText(
        "Omnileaf keeps its own folder in the Files app, so your backups and books are easy to copy or move.",
      ),
    ).toBeVisible();
    expect(await factsOf(card)).toEqual(IOS_HOME_FACTS);
  });
});

const PICKED_IN_FILES: WireFolder[] = [
  {
    id: "4",
    kind: "linked",
    name: "Comics",
    location:
      "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Comics",
    isAvailable: true,
  },
  {
    id: "5",
    kind: "linked",
    name: "Manga",
    location:
      "/private/var/mobile/Library/LiveFiles/com.apple.filesystems.userfsd/USB drive/Manga",
    isAvailable: true,
  },
  {
    id: "6",
    kind: "linked",
    name: "Old comics",
    location:
      "/private/var/mobile/Containers/Shared/AppGroup/0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9/File Provider Storage/Old comics",
    isAvailable: true,
  },
];

for (const [appleDevice, userAgent] of [
  ["iPhone", IPHONE_USER_AGENT],
  ["iPad", IPAD_USER_AGENT],
] as const) {
  test.describe(`folders picked in Files on an ${appleDevice}`, () => {
    testOnlyInItsWebview("ios");
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform("ios").backend.appInfo,
      },
      userAgent,
    });

    test.beforeEach(() => {
      device.folders = [HOME_FOLDER, ...PICKED_IN_FILES];
    });

    test("names each folder by where the Files app shows it, never its path", async ({
      page,
    }) => {
      await goTo(page, "Already have comics or books?", "ios");
      const rows = page
        .getByRole("region", { name: "Folders" })
        .getByRole("listitem");

      await expect(rows).toHaveCount(PICKED_IN_FILES.length);
      for (const [index, place] of [
        "iCloud Drive › Comics",
        "USB drive › Manga",
        `On My ${appleDevice} › Old comics`,
      ].entries()) {
        await expect(rows.nth(index)).toContainText(place);
      }
      for (const folder of PICKED_IN_FILES) {
        await expect(page.getByText(folder.location)).toHaveCount(0);
      }
    });
  });
}

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
  const next = await boxOf(page.getByRole("button", { name: /^Skip/ }));

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
  ).toHaveText(["Sample Comics /media/Sample Comics 7 books"]);
});

test("says how many books each linked folder holds, under its place", async ({
  page,
}) => {
  device.folders = [HOME_FOLDER, SAMPLE_COMICS];
  device.books.set(SAMPLE_COMICS.id, 214);
  await goTo(page, "Already have comics or books?");
  const row = page
    .getByRole("region", { name: "Folders" })
    .getByRole("listitem");

  const place = await boxOf(row.getByText(SAMPLE_COMICS.location));
  const count = await boxOf(row.getByText("214 books"));

  expect(count.y).toBeGreaterThanOrEqual(place.y + place.height);
});

test("offers only Skip until a folder is linked", async ({ page }) => {
  await goTo(page, "Already have comics or books?");

  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Skip/ })).toBeVisible();

  await page.getByRole("button", { name: "Add a folder" }).click();

  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
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
const LONG_ADD_FOLDER_HEIGHT = 52;
const HAS_PHONE_CORNERS = {
  ios: (radius: number) => radius === 14,
  android: (radius: number) => radius >= LONG_ADD_FOLDER_HEIGHT / 2,
} as const;

test.describe("Add a folder on android", () => {
  testOnlyInItsWebview("android");
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("draws Add a folder as one long outlined accent button with a plus", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?");
    const add = page
      .getByRole("region", { name: "Folders" })
      .getByRole("button", { name: "Add a folder" });

    const look = await lookOf(add);

    expect(look.height).toBe(LONG_ADD_FOLDER_HEIGHT);
    expect(look.border).toBe(
      `1px solid ${await colorOf(page, "--color-accent")}`,
    );
    expect(look.background).toBe(TRANSPARENT);
    await expect(add).toHaveCSS("color", await colorOf(page, "--color-accent"));
    await expect(add.locator("svg")).toHaveCount(1);
  });
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
      const help = choice.getByText("Light or dark, or follow your phone.");

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

test.describe("picking a folder on android", () => {
  testOnlyInItsWebview("android");
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("says what Android's folder picker will ask before it opens", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?", "android");

    await page.getByRole("button", { name: "Add a folder" }).click();
    const sheet = page.getByRole("alertdialog", { name: "Pick a folder" });

    await expect(sheet).toHaveAccessibleDescription(
      "Android shows its folder picker next. Choose a folder of comics or books, tap Use this folder, then Allow. Omnileaf reads it there and changes nothing.",
    );
    expect(device.folders).toEqual([HOME_FOLDER]);
  });

  test("opens the picker once the sheet goes on", async ({ page }) => {
    await goTo(page, "Already have comics or books?", "android");
    await page.getByRole("button", { name: "Add a folder" }).click();

    await page
      .getByRole("alertdialog", { name: "Pick a folder" })
      .getByRole("button", { name: "Continue" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
    ).toHaveCount(1);
  });

  test("leaves the picker closed with Not now", async ({ page }) => {
    await goTo(page, "Already have comics or books?", "android");
    await page.getByRole("button", { name: "Add a folder" }).click();

    await page.getByRole("button", { name: "Not now" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(device.folders).toEqual([HOME_FOLDER]);
    await expect(
      page.getByRole("button", { name: "Add a folder" }),
    ).toBeFocused();
  });

  test("goes straight to the picker once the sheet has gone on", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?", "android");
    await page.getByRole("button", { name: "Add a folder" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    device.folders = [HOME_FOLDER];

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(device.folders).toEqual([HOME_FOLDER, SAMPLE_COMICS]);
  });
});

test("opens the picker at once on a desktop", async ({ page }) => {
  await goTo(page, "Already have comics or books?");

  await page.getByRole("button", { name: "Add a folder" }).click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(device.folders).toEqual([HOME_FOLDER, SAMPLE_COMICS]);
});

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
        ? "Light or dark, or follow your phone."
        : "Light or dark, or follow this device.";

    await goTo(page, "A few choices");

    await expect(
      page.getByRole("radiogroup", { name: "Appearance" }),
    ).toHaveAccessibleDescription(help);
  });
});

test("starts 18+ covers on Blur and keeps it as the library's choice", async ({
  page,
}) => {
  await goTo(page, "A few choices");
  const covers = page.getByRole("radiogroup", { name: "18+ covers" });

  await expect(covers.getByRole("radio", { name: "Blur" })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page, EMPTY_READY_HEADING)).toBeVisible();
  expect(device.adultContent).toEqual({
    treatment: "blur",
    countsAgeRatings: false,
  });
});

test("keeps the 18+ covers choice made on the step", async ({ page }) => {
  await goTo(page, "A few choices");

  await page
    .getByRole("radiogroup", { name: "18+ covers" })
    .getByRole("radio", { name: "Hide" })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page, EMPTY_READY_HEADING)).toBeVisible();
  expect(device.adultContent.treatment).toBe("hide");
});

test("explains the appearance choice on a desktop", async ({ page }) => {
  await goTo(page, "A few choices");

  await expect(
    page.getByRole("radiogroup", { name: "Appearance" }),
  ).toHaveAccessibleDescription("Light or dark, or follow your computer.");
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

test("says the library is empty for now when no folder was linked", async ({
  page,
}) => {
  await goTo(page, EMPTY_READY_HEADING);

  await expect(
    page.getByText("Add folders from the empty library or Settings › Library."),
  ).toBeVisible();
  await expect(page.getByText(/is ready/)).toHaveCount(0);
});

function storyboardOf(page: Page): Promise<string[]> {
  return page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll("*")]
      .map((element) => getComputedStyle(element))
      .filter(
        (style) =>
          style.animationName !== "none" &&
          style.animationTimingFunction === "cubic-bezier(0.2, 0, 0, 1)" &&
          style.animationIterationCount === "1",
      )
      .map(
        (style) =>
          `${style.animationName} after ${style.animationDelay} for ${style.animationDuration}`,
      ),
  );
}

test.describe("once folders are linked", () => {
  test.beforeEach(() => {
    device.folders = [HOME_FOLDER, SAMPLE_COMICS, MANGA];
    device.books.set(SAMPLE_COMICS.id, 7).set(MANGA.id, 38);
    device.series.set(SAMPLE_COMICS.id, 3).set(MANGA.id, 32);
  });

  test("sets the leaf beside the check badge without running past it", async ({
    page,
  }) => {
    await goTo(page, FOUND_HEADING);
    await settle(page.getByRole("main"));

    expect(await sidewaysOverflow(page)).toEqual([]);
  });

  test("says how many series and books it found, and in which folder", async ({
    page,
  }) => {
    await goTo(page, FOUND_HEADING);
    const rows = page
      .getByRole("region", { name: "Folders" })
      .getByRole("listitem");

    await expect(
      page.getByText(
        "Your library is ready. Add or remove folders any time in Settings › Library.",
      ),
    ).toBeVisible();
    await expect(rows.nth(0)).toContainText("3 series · 7 books");
    await expect(rows.nth(1)).toContainText("32 series · 38 books");
    await expect(
      page.getByRole("region", { name: "Folders" }).getByRole("button", {
        name: "Add a folder",
      }),
    ).toHaveCount(0);
  });

  test("names the folder that couldn't be read and says how to fix it", async ({
    page,
  }) => {
    device.folders = [
      HOME_FOLDER,
      SAMPLE_COMICS,
      { ...MANGA, isAvailable: false },
    ];
    await goTo(page, "Manga couldn't be read");

    await expect(
      page.getByText(
        "Nothing in it changed. The rest of your library is ready.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("How to fix it");
    await expect(page.getByRole("alert")).toContainText(
      "Check that you can open it in your file manager, then Rescan.",
    );
  });

  test.describe("with covers to put on the shelf", () => {
    const COVERED = sampleSeries(7).map((series, index) => ({
      ...series,
      cover: index === 1 ? null : `covers/${series.id}.webp`,
      isAdult: index === 2,
    }));

    test.beforeEach(() => {
      device.shelf = COVERED;
    });

    test("plays the finishing animation once, over 900 ms", async ({
      page,
    }) => {
      await goTo(page, FOUND_HEADING);

      expect(await storyboardOf(page)).toEqual([
        "ready-grow after 0s for 0.2s",
        "ready-draw after 0.3s for 0.3s",
        "ready-leaf after 0.6s for 0.3s",
        "ready-settle after 0.3s for 0.3s",
        "ready-settle after 0.36s for 0.3s",
        "ready-settle after 0.42s for 0.3s",
        "ready-settle after 0.48s for 0.3s",
        "ready-settle after 0.54s for 0.3s",
      ]);
    });

    test("shows the last frame at once when motion is reduced", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });

      await goTo(page, FOUND_HEADING);

      expect(await storyboardOf(page)).toEqual([]);
    });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations once found, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await goTo(page, FOUND_HEADING);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

let endScan: () => void = () => undefined;

test.describe("while a folder is still being scanned", () => {
  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      addLibraryFolder: async (onProgress) => {
        await onProgress.send({
          stage: "adding",
          name: MANGA.name,
          location: MANGA.location,
        });
        await onProgress.send({ stage: "finding", found: 38 });
        await new Promise<void>((resolve) => {
          endScan = resolve;
        });
        device.folders.push(MANGA);
        device.books.set(MANGA.id, 38);
        device.series.set(MANGA.id, 32);
        return {
          name: MANGA.name,
          series: 32,
          books: 38,
          unreadableBooks: 0,
          unsupportedBooks: 0,
          unreadableFolders: 0,
        };
      },
    },
  });

  async function startScanning(page: Page): Promise<void> {
    await goTo(page, "Already have comics or books?");
    await page.getByRole("button", { name: "Add a folder" }).click();
    await expect(page.getByText("38 so far")).toBeVisible();
  }

  async function goOnWhileScanning(page: Page): Promise<void> {
    await startScanning(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }

  test("keeps the step's buttons clear of the scan's toast", async ({
    page,
  }) => {
    await startScanning(page);
    const toast = page.getByText("38 so far");
    const lowest = page.getByRole("button", { name: /^Skip/ });

    const [toastBox, buttonBox] = await Promise.all([
      boxOf(toast),
      boxOf(lowest),
    ]);

    expect(
      toastBox.y + toastBox.height <= buttonBox.y ||
        toastBox.y >= buttonBox.y + buttonBox.height ||
        toastBox.x >= buttonBox.x + buttonBox.width ||
        toastBox.x + toastBox.width <= buttonBox.x,
    ).toBe(true);
  });

  const BAR = "[role=progressbar]";

  function scannedRow(page: Page): Locator {
    return page
      .getByRole("region", { name: "Folders" })
      .getByRole("listitem")
      .filter({ hasText: MANGA.name });
  }

  test("names the folder in its own row and counts what it finds", async ({
    page,
  }) => {
    await startScanning(page);

    await expect(scannedRow(page)).toContainText(MANGA.location);
    await expect(scannedRow(page)).toContainText("Counting… 38 so far");
    await expect(
      scannedRow(page).getByRole("button", { name: /Remove/ }),
    ).toHaveCount(0);
    await expect(scannedRow(page).locator(BAR)).toHaveCount(0);
  });

  test("keeps counting in the folder's row on You're all set, over a bar", async ({
    page,
  }) => {
    await goOnWhileScanning(page);

    await expect(scannedRow(page)).toContainText("Counting… 38 so far");
    await expect(scannedRow(page).locator(BAR)).toHaveCount(1);
  });

  test("offers Continue on Link folders while the folder is scanned", async ({
    page,
  }) => {
    await startScanning(page);

    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeVisible();
  });

  test("says it is still finding books, and opens the library straight away", async ({
    page,
  }) => {
    await goOnWhileScanning(page);

    await expect(heading(page, "You're all set")).toBeVisible();
    await expect(
      page.getByText(
        "Omnileaf is still finding books. You can open your library now; scanning carries on.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open my library" }).click();
    await expect(heading(page, "Library")).toBeVisible();
  });

  test("says what it found once the scan ends", async ({ page }) => {
    await goOnWhileScanning(page);
    await expect(heading(page, "You're all set")).toBeVisible();

    endScan();

    await expect(heading(page, "Found 32 series and 38 books")).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations while still finding, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await goOnWhileScanning(page);
      await expect(heading(page, "You're all set")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

const DROPPED = "/media/usb/Comics 2";
const DROP_HINT =
  "Folders on this computer, external drives and network shares all work.";

test.describe("dropping folders on a desktop", () => {
  const linked: string[] = [];

  test.use({
    backend: {
      ...FIRST_LAUNCH_BACKEND,
      linkLibraryFolder: (folder) => {
        linked.push(folder);
        device.folders.push({
          id: "7",
          kind: "linked",
          name: "Comics 2",
          location: folder,
          isAvailable: true,
        });
        return {
          name: "Comics 2",
          series: 2,
          books: 12,
          unreadableBooks: 0,
          unsupportedBooks: 0,
          unreadableFolders: 0,
        };
      },
    },
  });

  test.beforeEach(() => {
    linked.length = 0;
  });

  function dropArea(page: Page): Locator {
    return page.getByRole("group", { name: "Drop folders here" });
  }

  test("holds Add a folder and where folders can come from in a drop area", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?");

    await expect(dropArea(page)).toContainText(DROP_HINT);
    await expect(
      dropArea(page).getByRole("button", { name: "Add a folder" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a folder" }),
    ).toHaveCount(1);
  });

  test("names the folder being dragged over the window", async ({ page }) => {
    await goTo(page, "Already have comics or books?");

    await emitFakeEvent(page, TauriEvent.DRAG_ENTER, {
      paths: [DROPPED],
      position: { x: 10, y: 10 },
    });
    await expect(dropArea(page)).toContainText("Drop to link Comics 2");
    await emitFakeEvent(page, TauriEvent.DRAG_LEAVE, null);

    await expect(dropArea(page)).toContainText("Drop folders here");
  });

  test("links a folder dropped on the window, as Add a folder does", async ({
    page,
  }) => {
    await goTo(page, "Already have comics or books?");

    await emitFakeEvent(page, TauriEvent.DRAG_DROP, {
      paths: [DROPPED],
      position: { x: 10, y: 10 },
    });

    await expect(
      page.getByRole("region", { name: "Folders" }).getByRole("listitem"),
    ).toContainText(["Comics 2"]);
    expect(linked).toEqual([DROPPED]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations while a folder is dragged over, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await goTo(page, "Already have comics or books?");
      await emitFakeEvent(page, TauriEvent.DRAG_ENTER, {
        paths: [DROPPED],
        position: { x: 10, y: 10 },
      });
      await expect(dropArea(page)).toContainText("Drop to link Comics 2");

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`Link folders on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test("offers no drop area, since folders can't be dropped there", async ({
      page,
    }) => {
      await goTo(page, "Already have comics or books?", platform);

      await expect(
        page.getByRole("group", { name: "Drop folders here" }),
      ).toHaveCount(0);
    });
  });
}

test("goes back a step with the browser's back", async ({ page }) => {
  await goTo(page, "Where your library lives");

  await page.goBack();

  await expect(heading(page, "Welcome to Omnileaf")).toBeVisible();
});

test("stays on the last step and says so when finishing fails", async ({
  page,
}) => {
  device.failsToFinish = true;
  await goTo(page, EMPTY_READY_HEADING);

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

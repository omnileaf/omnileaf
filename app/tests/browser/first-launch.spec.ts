import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
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
      unreadableFolders: 0,
    };
  },
};

const STEPS = [
  { heading: "Welcome to Omnileaf", leaveWith: "Get started" },
  { heading: "Where your library lives", leaveWith: "Continue" },
  { heading: "Already have comics or books?", leaveWith: "Continue" },
  { heading: "A few choices", leaveWith: "Continue" },
  { heading: "You're all set", leaveWith: "Open my library" },
] as const;

test.use({ backend: FIRST_LAUNCH_BACKEND });

test.beforeEach(() => {
  device.reset();
});

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

async function goTo(page: Page, stepHeading: string): Promise<void> {
  await page.goto("/first-launch");
  for (const step of STEPS) {
    await expect(heading(page, step.heading)).toBeVisible();
    if (step.heading === stepHeading) {
      return;
    }
    await page.getByRole("button", { name: step.leaveWith }).click();
  }
}

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

test("shows the home folder the library lives in", async ({ page }) => {
  await goTo(page, "Where your library lives");

  await expect(page.getByText(HOME_FOLDER.location)).toBeVisible();
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
  ).toHaveText(["Sample Comics /media/Sample Comics Remove"]);
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

      await goTo(page, "Already have comics or books?");

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
      page.getByRole("group", { name: "Appearance" }),
    ).toHaveAccessibleDescription(help);
  });
});

test("turns the app dark from the choices", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await goTo(page, "A few choices");

  await page
    .getByRole("group", { name: "Appearance" })
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

  await expect(page.getByRole("alert")).toHaveText(
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

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
}

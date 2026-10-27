import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  IPHONE_USER_AGENT,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const HOME_LOCATION = "/data/Omnileaf";
const FOUND_HEADING = "A library is already here";
const USE_LIBRARY = "Use this library";
const START_NEW_LIBRARY = "Start a new library instead";
const STACKED_BUTTON_GAP = 6;
const DESKTOP_CHANGE_HEIGHT = 38;
const ANDROID_CHANGE_ROW = "Home folder";
const DESKTOP_HOME_HEADER_HEIGHT = 62;
const FOUND_FACTS = [
  ["Series", "212"],
  ["Books", "38"],
  ["Last backup", "October 12, 2026"],
];

function foundOn(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({
      folders: [
        {
          id: "1",
          kind: "home",
          name: "Omnileaf",
          location: HOME_LOCATION,
          isAvailable: true,
        },
      ],
      next: null,
    }),
    foundLibrary: () => ({
      series: 212,
      books: 38,
      lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
    }),
  };
}

async function goToTheHomeFolder(page: Page): Promise<void> {
  await page.goto("/first-launch");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: FOUND_HEADING }),
  ).toBeVisible();
}

function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function homeCard(page: Page): Locator {
  return page.getByRole("region", { name: "Home folder" });
}

function factsOf(card: Locator): Promise<string[][]> {
  return card
    .locator("dl > div")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.children].map((cell) => cell.textContent.trim()),
      ),
    );
}

async function expectComingSoon(page: Page, control: Locator, name: string) {
  await control.hover();

  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByText(`${name} · coming soon`, { exact: true }),
  ).toBeVisible();
  await expect(control).toHaveAccessibleDescription(`${name} · coming soon`);
}

for (const platform of ["android", "linux"] as const) {
  test.describe(`a library already in the home folder on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use({ backend: foundOn(platform) });

    test("says what the library holds under its path, on ruled rows", async ({
      page,
    }) => {
      await goToTheHomeFolder(page);

      await expect(
        page.getByText(
          "Use it to bring back your progress, categories and settings, as they were.",
        ),
      ).toBeVisible();
      await expect(homeCard(page).locator("code")).toHaveText(HOME_LOCATION);
      expect(await factsOf(homeCard(page))).toEqual(FOUND_FACTS);
    });

    test("focuses its heading on the way in and goes back to the welcome", async ({
      page,
    }) => {
      await goToTheHomeFolder(page);
      await expect(
        page.getByRole("heading", { level: 1, name: FOUND_HEADING }),
      ).toBeFocused();

      await button(page, "Back").click();

      await expect(
        page.getByRole("heading", { level: 1, name: "Welcome to Omnileaf" }),
      ).toBeVisible();
    });

    test("starts a new library instead, going on to link folders", async ({
      page,
    }) => {
      await goToTheHomeFolder(page);

      await button(page, START_NEW_LIBRARY).click();

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Already have comics or books?",
        }),
      ).toBeVisible();
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await goToTheHomeFolder(page);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  });
}

test.describe("a library already in the home folder on a desktop", () => {
  testOnlyInItsWebview("linux");
  test.use({ backend: foundOn("linux") });

  test("puts Change at the end of the card's header, as an outlined button", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);
    const card = await boxOf(homeCard(page));

    const change = await boxOf(
      homeCard(page).getByRole("button", { name: "Change", exact: true }),
    );

    expect(change.x + change.width).toBeLessThan(card.x + card.width);
    expect(change.width).toBeLessThan(card.width / 2);
    await expect(
      homeCard(page).getByRole("button", { name: "Change", exact: true }),
    ).toHaveText("Change");
  });

  test("draws Change at the outlined button's height, keeping the header as drawn", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);
    const heading = homeCard(page).getByRole("heading", {
      name: "Home folder",
    });

    const [change, header] = await Promise.all([
      boxOf(
        homeCard(page).getByRole("button", { name: "Change", exact: true }),
      ),
      boxOf(heading.locator("..")),
    ]);

    expect(change.height).toBe(DESKTOP_CHANGE_HEIGHT);
    expect(header.height).toBe(DESKTOP_HOME_HEADER_HEIGHT);
  });

  test("sets Back apart, then Start a new library instead and Use this library last", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "the step dialog's row of buttons",
    );
    await goToTheHomeFolder(page);
    const [back, start, use] = await Promise.all([
      boxOf(button(page, "Back")),
      boxOf(button(page, START_NEW_LIBRARY)),
      boxOf(button(page, USE_LIBRARY)),
    ]);

    expect([back.y, start.y]).toEqual([use.y, use.y]);
    expect(back.x + back.width).toBeLessThan(start.x);
    expect(start.x + start.width).toBeLessThan(use.x);
  });
});

test.describe("a library already in the home folder on an android phone", () => {
  testOnlyInItsWebview("android");
  test.use({ backend: foundOn("android") });

  test("makes the whole Home folder row the Change control", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);
    const card = await boxOf(homeCard(page));
    const heading = await boxOf(
      homeCard(page).getByRole("heading", { name: "Home folder" }),
    );

    const change = await boxOf(
      homeCard(page).getByRole("button", {
        name: ANDROID_CHANGE_ROW,
        exact: true,
      }),
    );

    expect([change.x, change.width]).toEqual([card.x + 1, card.width - 2]);
    expect(change.y).toBeLessThan(heading.y);
    expect(change.y + change.height).toBeGreaterThan(
      heading.y + heading.height,
    );
  });

  test("names the Home folder row by its title, described by the path", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);

    const row = homeCard(page).getByRole("button");

    await expect(row).toHaveAccessibleName(ANDROID_CHANGE_ROW);
    await expect(row).toHaveAccessibleDescription(HOME_LOCATION);
  });

  test("keeps Use this library in reach, saying it's coming soon", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);
    const use = button(page, USE_LIBRARY);

    await expectComingSoon(page, use, USE_LIBRARY);
    await use.click({ force: true });

    await expect(
      page.getByRole("heading", { level: 1, name: FOUND_HEADING }),
    ).toBeVisible();
  });

  test("says changing the home folder is coming soon", async ({ page }) => {
    await goToTheHomeFolder(page);

    await expectComingSoon(
      page,
      homeCard(page).getByRole("button", {
        name: ANDROID_CHANGE_ROW,
        exact: true,
      }),
      "Change",
    );
  });

  test("stacks Use this library 6px over Start a new library instead", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "the full-screen step's stack of buttons",
    );
    await goToTheHomeFolder(page);

    const [use, start] = await Promise.all([
      boxOf(button(page, USE_LIBRARY)),
      boxOf(button(page, START_NEW_LIBRARY)),
    ]);

    expect(start.y - (use.y + use.height)).toBe(STACKED_BUTTON_GAP);
    expect([start.x, start.width]).toEqual([use.x, use.width]);
  });
});

test.describe("a library already in the home folder on an iPhone", () => {
  testOnlyInItsWebview("ios");
  test.use({ backend: foundOn("ios"), userAgent: IPHONE_USER_AGENT });

  test("offers no Change, since the library stays inside the app", async ({
    page,
  }) => {
    await goToTheHomeFolder(page);

    await expect(homeCard(page).getByRole("button")).toHaveCount(0);
  });
});

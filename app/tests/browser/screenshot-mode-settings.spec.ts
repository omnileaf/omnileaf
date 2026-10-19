import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const TURNED_ON_AT = new Date("2026-10-03T21:14:00Z");
const INTRO_GAP = 8;

const OPTIONS = [
  "Blank the pages in the reader",
  "Show the Screenshot mode label",
];

async function openScreenshotMode(page: Page): Promise<void> {
  await page.goto("/settings");
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "Privacy and security" }).click();
  await main.getByRole("link", { name: /^Screenshot mode/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Screenshot mode" }),
  ).toBeVisible();
}

function mainSwitch(page: Page) {
  return page.getByRole("switch", { name: "Screenshot mode", exact: true });
}

function cardHolding(page: Page, part: Locator) {
  return page.locator("div:has(> [role=switch])").filter({ has: part });
}

function labelSwitch(page: Page) {
  return page.getByRole("switch", { name: "Show the Screenshot mode label" });
}

test("turning it on says when it turns off again", async ({ page }) => {
  await page.clock.install({ time: TURNED_ON_AT });
  await openScreenshotMode(page);
  await expect(mainSwitch(page)).not.toBeChecked();

  await mainSwitch(page).click();

  await expect(mainSwitch(page)).toBeChecked();
  await expect(mainSwitch(page)).toHaveAccessibleDescription(
    "On until 10:14 PM",
  );
});

test("turns off after an hour until told never to", async ({ page }) => {
  await openScreenshotMode(page);
  const turnOffAfter = page.getByRole("combobox", { name: "Turn off after" });
  await expect(turnOffAfter).toHaveValue("hour");

  await turnOffAfter.selectOption({ label: "Never" });
  await page.reload();
  await mainSwitch(page).click();

  await expect(turnOffAfter).toHaveValue("never");
  await expect(mainSwitch(page)).toHaveAccessibleDescription("On");
});

test("it stays on after a restart and Privacy and security says so", async ({
  page,
}) => {
  await openScreenshotMode(page);
  await mainSwitch(page).click();

  await page.reload();
  await expect(mainSwitch(page)).toBeChecked();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Privacy and security" })
    .and(page.locator("a:not(nav a)"))
    .click();

  await expect(
    page.getByRole("main").getByRole("link", { name: "Screenshot mode On" }),
  ).toBeVisible();
});

test("the options start on and stay off once turned off", async ({ page }) => {
  await openScreenshotMode(page);
  for (const option of OPTIONS) {
    await expect(page.getByRole("switch", { name: option })).toBeChecked();
    await page.getByRole("switch", { name: option }).click();
  }

  await page.reload();

  for (const option of OPTIONS) {
    await expect(page.getByRole("switch", { name: option })).not.toBeChecked();
  }
});

test("Space turns it on from the keyboard", async ({ page }) => {
  await openScreenshotMode(page);
  await mainSwitch(page).focus();

  await page.keyboard.press("Space");

  await expect(mainSwitch(page)).toBeChecked();
});

test("sets the intro 8px above its card", async ({ page }) => {
  await openScreenshotMode(page);

  const intro = await boxOf(page.getByText(/^Swaps names and covers/));
  const card = await boxOf(cardHolding(page, mainSwitch(page)));

  expect(card.y - (intro.y + intro.height)).toBe(INTRO_GAP);
});

const NARROW_DESKTOP_WIDTHS = [360, 390, 840] as const;

test.describe("in a narrow desktop window", () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test.skip(({ isMobile }) => isMobile, "desktop windows");

  test("puts Turn off after above its choice, inside the card", async ({
    page,
  }) => {
    await page.goto("/settings/privacy/screenshot-mode");
    const label = page.getByText("Turn off after", { exact: true });
    const choice = page.getByRole("combobox", { name: "Turn off after" });

    const labelBox = await boxOf(label);
    const choiceBox = await boxOf(choice);
    const cardBox = await boxOf(cardHolding(page, choice));

    expect(
      await label.evaluate((shown) => shown.scrollWidth - shown.clientWidth),
    ).toBe(0);
    expect(choiceBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height);
    expect(choiceBox.x + choiceBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width,
    );
  });

  for (const width of NARROW_DESKTOP_WIDTHS) {
    test.describe(`${String(width)}px wide`, () => {
      test.use({ viewport: { width, height: 800 } });

      test("keeps the keyboard shortcut's keys and Change inside their card", async ({
        page,
      }) => {
        await page.goto("/settings/privacy/screenshot-mode");
        const card = page.getByRole("region", { name: "Turn it on quickly" });

        const lastKey = await boxOf(card.locator("kbd").last());
        const change = await boxOf(
          card.getByRole("button", { name: "Change the keyboard shortcut" }),
        );
        const cardBox = await boxOf(card);

        expect(lastKey.x + lastKey.width).toBeLessThanOrEqual(
          cardBox.x + cardBox.width,
        );
        expect(change.x + change.width).toBeLessThanOrEqual(
          cardBox.x + cardBox.width,
        );
      });
    });
  }
});

test("says what it changes before the switch", async ({ page }) => {
  await openScreenshotMode(page);

  await expect(
    page.getByText(
      "Swaps names and covers for stand-ins, hides 18+ and leaves it out of counts, so screenshots show nothing private. Progress, dates and settings stay real.",
    ),
  ).toBeVisible();
});

test("the keyboard shortcut is listed on a computer", async ({ page }) => {
  await openScreenshotMode(page);

  await expect(
    page.getByRole("region", { name: "Turn it on quickly" }),
  ).toContainText("Keyboard shortcut");
});

const SHORTCUT_HINTS = [
  { platform: "macos", keys: ["⌘", "Shift", "H"] },
  { platform: "linux", keys: ["Ctrl", "Shift", "H"] },
  { platform: "windows", keys: ["Ctrl", "Shift", "H"] },
] as const;

for (const { platform, keys } of SHORTCUT_HINTS) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test(`the shortcut is shown as ${keys.join(" ")}`, async ({ page }) => {
      await openScreenshotMode(page);

      await expect(page.getByRole("main").locator("kbd")).toHaveText(keys);
    });
  });
}

test("a shortcut chosen earlier is the one shown", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "omnileaf.screenshotModeShortcut",
      JSON.stringify({ letter: "J", shift: false }),
    );
  });

  await openScreenshotMode(page);

  await expect(page.getByRole("main").locator("kbd")).toHaveText(["Ctrl", "J"]);
});

test("the label is said to show at the top of the window on a computer", async ({
  page,
}) => {
  await openScreenshotMode(page);

  await expect(labelSwitch(page)).toHaveAccessibleDescription(
    "At the top of the window, so you know it’s on.",
  );
});

test.describe("on a phone", () => {
  test.use(onPlatform("android"));

  test("the label is said to show at the top of the screen", async ({
    page,
  }) => {
    await openScreenshotMode(page);

    await expect(labelSwitch(page)).toHaveAccessibleDescription(
      "At the top of the screen, so you know it’s on.",
    );
  });

  test("no keyboard shortcut is listed", async ({ page }) => {
    await openScreenshotMode(page);

    await expect(page.getByText("Keyboard shortcut")).toHaveCount(0);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const isOn of [false, true]) {
    test(`has no accessibility violations in ${colorScheme} while ${isOn ? "on" : "off"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openScreenshotMode(page);
      if (isOn) {
        await mainSwitch(page).click();
      }

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
}

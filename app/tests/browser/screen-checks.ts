import type { Browser, Page, ViewportSize } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  expect,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  openFakeApp,
  platformsShownBy,
  screenSizeAt,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import { SCREENS, type Screen, visit } from "./screens.ts";

type Theme = "light" | "dark";

interface ScreenCheck {
  readonly name: string;
  readonly problemsOn: (page: Page) => Promise<readonly string[]>;
}

const CHECKS: readonly ScreenCheck[] = [
  {
    name: "scrolls nothing sideways",
    problemsOn: (page) => sidewaysOverflow(page, "body"),
  },
];

function appleUserAgentAt(viewport: ViewportSize | null): string {
  return viewport !== null && screenSizeAt(viewport.width) === "phone"
    ? IPHONE_USER_AGENT
    : IPAD_USER_AGENT;
}

async function checkScreen(
  browser: Browser,
  screen: Screen,
  { platform, theme }: { platform: Platform; theme: Theme },
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await openFakeApp(context, screen.backend(platform));
    await visit(page, screen);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    for (const check of CHECKS) {
      expect
        .soft(await check.problemsOn(page), `${check.name} on ${platform}`)
        .toEqual([]);
    }
  } finally {
    await context.close();
  }
}

export function checkEveryScreenIn(theme: Theme): void {
  test.use({
    colorScheme: theme,
    userAgent: async ({ browserName, hasTouch, userAgent, viewport }, use) => {
      const showsIos = platformsShownBy({ browserName, hasTouch }).includes(
        "ios",
      );
      await use(showsIos ? appleUserAgentAt(viewport) : userAgent);
    },
  });

  for (const screen of SCREENS) {
    test(`${screen.name} passes the screen checks`, async ({
      browser,
      browserName,
      hasTouch,
    }) => {
      for (const platform of platformsShownBy({ browserName, hasTouch })) {
        await test.step(`on ${platform}`, () =>
          checkScreen(browser, screen, { platform, theme }));
      }
    });
  }
}

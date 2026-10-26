import type { Browser, Page, ViewportSize } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  expect,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  openFakeApp,
  platformsShownBy,
  screenSizeAt,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import { iconsOffTheirLine } from "./icon-lines.ts";
import { SCREENS, type Screen, visit } from "./screens.ts";
import { targetsTooSmall } from "./target-sizes.ts";
import { overlaps, textClippedUnmarked } from "./text-fit.ts";

type Theme = "light" | "dark";

export interface ScreenCheck {
  readonly name: string;
  readonly problemsOn: (page: Page) => Promise<readonly string[]>;
}

const CHECKS: readonly ScreenCheck[] = [
  {
    name: "scrolls nothing sideways",
    problemsOn: (page) => sidewaysOverflow(page, "body"),
  },
  {
    name: "cuts no text off without an ellipsis or a line clamp",
    problemsOn: textClippedUnmarked,
  },
  {
    name: "overlaps no text or controls",
    problemsOn: overlaps,
  },
  {
    name: "centres each leading icon on its first line",
    problemsOn: iconsOffTheirLine,
  },
  {
    name: "offers targets its platform can reach",
    problemsOn: targetsTooSmall,
  },
  {
    name: "has no accessibility violations",
    problemsOn: async (page) =>
      (await accessibilityViolations(page)).flatMap((violation) =>
        violation.nodes.map(
          (node) => `${violation.id} on ${node.target.join(" ")}`,
        ),
      ),
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
  {
    platform,
    theme,
    checks,
  }: { platform: Platform; theme: Theme; checks: readonly ScreenCheck[] },
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await openFakeApp(context, screen.backend(platform));
    await visit(page, screen, platform);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    for (const check of checks) {
      expect
        .soft(await check.problemsOn(page), `${check.name} on ${platform}`)
        .toEqual([]);
    }
  } finally {
    await context.close();
  }
}

export function checkEveryScreenIn(
  theme: Theme,
  { checks, passes }: { checks: readonly ScreenCheck[]; passes: string } = {
    checks: CHECKS,
    passes: "passes the screen checks",
  },
): void {
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
    test(`${screen.name} ${passes}`, async ({
      browser,
      browserName,
      hasTouch,
    }) => {
      for (const platform of platformsShownBy({ browserName, hasTouch })) {
        await test.step(`on ${platform}`, () =>
          checkScreen(browser, screen, { platform, theme, checks }));
      }
    });
  }
}

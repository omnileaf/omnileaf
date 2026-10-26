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
import { SCREEN_SWEEP_TAG } from "../test-group.ts";
import { targetsTooSmall } from "./target-sizes.ts";
import { overlaps, textClippedUnmarked } from "./text-fit.ts";

type Theme = "light" | "dark";

export type PlatformPace = "side by side" | "one after another";

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

async function checkEachPlatform(
  platforms: readonly Platform[],
  pace: PlatformPace,
  check: (platform: Platform) => Promise<void>,
): Promise<void> {
  if (pace === "one after another") {
    for (const platform of platforms) {
      await check(platform);
    }
    return;
  }
  const settled = await Promise.allSettled(platforms.map(check));
  const failed = settled.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (failed !== undefined) {
    throw failed.reason;
  }
}

export function checkEveryScreenIn(
  theme: Theme,
  {
    checks,
    passes,
    pace,
  }: {
    checks: readonly ScreenCheck[];
    passes: string;
    pace: PlatformPace;
  } = {
    checks: CHECKS,
    passes: "passes the screen checks",
    pace: "side by side",
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
    test(
      `${screen.name} ${passes}`,
      { tag: SCREEN_SWEEP_TAG },
      async ({ browser, browserName, hasTouch }) => {
        await checkEachPlatform(
          platformsShownBy({ browserName, hasTouch }),
          pace,
          (platform) =>
            test.step(`on ${platform}`, () =>
              checkScreen(browser, screen, { platform, theme, checks })),
        );
      },
    );
  }
}

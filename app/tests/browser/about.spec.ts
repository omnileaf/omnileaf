import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import type { Platform, ProjectLink } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  FAKE_APP_VERSION,
  FAKE_SOURCE_CODE,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const ABOUT_PAGE = "/settings/about";
const PHONE_ROW_HEIGHT = 64;
const ROW_DIVIDER_WIDTH = 1;
const PANE_ROW_HEIGHT = 56;
const TOUCH_BUTTON_HEIGHT = 48;
const POINTER_BUTTON_HEIGHT = 36;
const PHONE_ICON_SIZE = 72;
const SMALL_PHONE = { width: 360, height: 800 };
const LARGEST_TEXT = "html { font-size: 200%; }";
const PANE_ICON_SIZE = 56;

function copyButton(page: Page) {
  return page.getByRole("button", { name: "Copy version details" });
}

function linkRow(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^${name}`) });
}

function appIcon(page: Page) {
  return page.getByRole("main").locator("img");
}

async function expectCopyButtonInsideCard(page: Page): Promise<void> {
  const card = await boxOf(page.getByRole("main").getByRole("list").first());
  const button = await boxOf(
    page.getByRole("main").getByRole("listitem").first().getByRole("button"),
  );
  const content = await page.getByRole("main").evaluate((main) => ({
    width: main.clientWidth,
    scrolls: main.scrollWidth,
  }));

  expect(button.x + button.width).toBeLessThanOrEqual(card.x + card.width);
  expect(content.scrolls).toBeLessThanOrEqual(content.width);
}

async function openAbout(page: Page): Promise<void> {
  await page.goto(ABOUT_PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "About" }),
  ).toBeVisible();
}

test.describe("with a working clipboard and browser", () => {
  const opened: ProjectLink[] = [];
  const copies = { count: 0 };

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      copyVersionDetails: () => {
        copies.count += 1;
        return null;
      },
      openProjectLink: (link) => {
        opened.push(link);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    opened.length = 0;
    copies.count = 0;
  });

  test("copies the version details and says so", async ({ page }) => {
    await openAbout(page);

    await copyButton(page).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "Version details copied.",
    );
    await expect(
      page.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(copies.count).toBe(1);
  });

  test("opens the source code in the browser", async ({ page }) => {
    await openAbout(page);

    await linkRow(page, "Source code").click();

    await expect.poll(() => opened).toEqual(["sourceCode"]);
  });

  test("opens a new issue to report a problem", async ({ page }) => {
    await openAbout(page);

    await linkRow(page, "Report a problem").click();

    await expect.poll(() => opened).toEqual(["newIssue"]);
  });
});

test.describe("when the device turns the app down", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      copyVersionDetails: () => {
        throw new CommandFailure({
          code: "clipboardUnavailable",
          message: "the clipboard could not be written",
        });
      },
      openProjectLink: () => {
        throw new CommandFailure({
          code: "browserUnavailable",
          message: "the browser could not be opened",
        });
      },
    },
  });

  test("says the version details couldn't be copied", async ({ page }) => {
    await openAbout(page);

    await copyButton(page).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Couldn't copy the version details. Try again.",
    );
  });

  test("says the browser couldn't be opened", async ({ page }) => {
    await openAbout(page);

    await linkRow(page, "Source code").click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Couldn't open your browser. Try again.",
    );
  });
});

test("shows where the source code lives", async ({ page }) => {
  await openAbout(page);

  await expect(linkRow(page, "Source code")).toContainText(FAKE_SOURCE_CODE);
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on an ${platform} phone`, () => {
    test.use(onPlatform(platform));

    test("puts the version in the list beside Copy version details, on 64px rows", async ({
      page,
    }) => {
      await openAbout(page);
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

      const version = page.getByRole("listitem").filter({ hasText: "Version" });
      const button = await boxOf(copyButton(page));
      const versionRow = await boxOf(version);
      const sourceRow = await boxOf(linkRow(page, "Source code"));
      const icon = await boxOf(appIcon(page));

      await expect(version).toContainText(FAKE_APP_VERSION);
      await expect(version.getByRole("button")).toHaveText(
        "Copy version details",
      );
      expect(versionRow.height).toBe(PHONE_ROW_HEIGHT + ROW_DIVIDER_WIDTH);
      expect(sourceRow.height).toBe(PHONE_ROW_HEIGHT);
      expect(button.height).toBe(TOUCH_BUTTON_HEIGHT);
      expect(icon.width).toBe(PHONE_ICON_SIZE);
    });

    test.describe("on a small phone", () => {
      test.use({ viewport: SMALL_PHONE });

      test("keeps Copy version details inside the card in a longer language", async ({
        page,
      }) => {
        await page.addInitScript(() => {
          window.localStorage.setItem("omnileaf.language", "en-XA");
        });
        await page.goto(ABOUT_PAGE);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(
          "⟦",
        );

        await expectCopyButtonInsideCard(page);
      });

      test("keeps Copy version details inside the card with the largest text", async ({
        page,
      }) => {
        await openAbout(page);

        await page.addStyleTag({ content: LARGEST_TEXT });

        await expectCopyButtonInsideCard(page);
      });
    });
  });
}

const PANE_SIZES: readonly {
  platform: Platform;
  buttonHeight: number;
}[] = [
  { platform: "android", buttonHeight: TOUCH_BUTTON_HEIGHT },
  { platform: "linux", buttonHeight: POINTER_BUTTON_HEIGHT },
];

for (const { platform, buttonHeight } of PANE_SIZES) {
  test.describe(`on ${platform} beside the phone width`, () => {
    test.use(onPlatform(platform));

    test(`heads the pane with the version and a ${String(buttonHeight)}px copy button over 56px rows`, async ({
      page,
    }) => {
      await openAbout(page);
      test.skip(
        platform === "android" && viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "tablets only",
      );

      const button = await boxOf(copyButton(page));
      const sourceRow = await boxOf(linkRow(page, "Source code"));
      const icon = await boxOf(appIcon(page));

      await expect(
        page.getByText(`Version ${FAKE_APP_VERSION}`, { exact: true }),
      ).toBeVisible();
      expect(button.height).toBe(buttonHeight);
      expect(sourceRow.y).toBeGreaterThan(button.y + button.height);
      expect(sourceRow.height).toBe(PANE_ROW_HEIGHT);
      expect(icon.width).toBe(PANE_ICON_SIZE);
    });

    test("puts the copy button beside the name from 600px", async ({
      page,
    }) => {
      await openAbout(page);
      test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "600px and wider");

      const button = await boxOf(copyButton(page));
      const title = await boxOf(
        page.getByRole("heading", { level: 2, name: "Omnileaf" }),
      );

      expect(button.x).toBeGreaterThan(title.x + title.width);
    });
  });
}

test.describe("in a desktop window under 600px", () => {
  test.use(onPlatform("linux"));

  test("keeps the copy button inside the window in a longer language", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await page.goto(ABOUT_PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("⟦");
    const { width } = viewportOf(page);
    test.skip(width >= MEDIUM_MIN_WIDTH, "under 600px only");

    const button = await boxOf(
      page.getByRole("main").getByRole("button").first(),
    );
    const sourceRow = await boxOf(
      page.getByRole("main").getByRole("listitem").first(),
    );

    expect(button.x + button.width).toBeLessThanOrEqual(width);
    expect(sourceRow.y).toBeGreaterThan(button.y + button.height);
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      test.use(onPlatform(platform));

      test(`Settings › About has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openAbout(page);

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });
    });
  }
}

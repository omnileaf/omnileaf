import type { Page } from "@playwright/test";

import type { Platform, ProjectLink } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  FAKE_APP_VERSION,
  FAKE_SOURCE_CODE,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  selectedByDoubleClick,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const ABOUT_PAGE = "/settings/about";
const PHONE_ROW_HEIGHT = 64;
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

function versionRowButton(page: Page) {
  return page
    .getByRole("main")
    .getByRole("listitem")
    .last()
    .getByRole("button");
}

function linkRow(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^${name}`) });
}

function appIcon(page: Page) {
  return page.getByRole("main").locator("img");
}

async function expectCopyButtonInsideCard(page: Page): Promise<void> {
  const card = await boxOf(page.getByRole("main").getByRole("list").first());
  const button = await boxOf(versionRowButton(page));
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

  test("lets the version be selected", async ({ page }) => {
    await openAbout(page);

    const selected = await selectedByDoubleClick(
      page,
      page
        .getByRole("main")
        .getByText(FAKE_APP_VERSION, { exact: false })
        .filter({ visible: true })
        .first(),
    );

    expect(selected.trim()).not.toBe("");
  });

  test("opens the source code in the browser", async ({ page }) => {
    await openAbout(page);

    await linkRow(page, "Source code").click();

    await expect.poll(() => opened).toEqual(["sourceCode"]);
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
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test("lists the version details with a copy button, on 64px rows", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      await openAbout(page);

      const version = page
        .getByRole("listitem")
        .filter({ hasText: "Version details" });
      const button = await boxOf(copyButton(page));
      const versionRow = await boxOf(version);
      const sourceRow = await boxOf(linkRow(page, "Source code"));
      const icon = await boxOf(appIcon(page));

      await expect(version).toContainText(FAKE_APP_VERSION);
      await expect(
        version.getByRole("button", { name: "Copy version details" }),
      ).toBeVisible();
      expect(versionRow.height).toBe(PHONE_ROW_HEIGHT);
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
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test(`heads the pane with the version over 56px rows, with a ${String(buttonHeight)}px copy button`, async ({
      page,
    }) => {
      test.skip(
        platform === "android" && viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "tablets only",
      );
      await openAbout(page);

      const button = await boxOf(copyButton(page));
      const sourceRow = await boxOf(linkRow(page, "Source code"));
      const icon = await boxOf(appIcon(page));

      await expect(
        page.getByText(`Version ${FAKE_APP_VERSION}`, { exact: true }),
      ).toBeVisible();
      expect(button.height).toBe(buttonHeight);
      expect(sourceRow.height).toBe(PANE_ROW_HEIGHT);
      expect(icon.width).toBe(PANE_ICON_SIZE);
    });

    test("centres the icon over the name and the version", async ({ page }) => {
      await openAbout(page);

      const icon = await boxOf(appIcon(page));
      const title = await boxOf(
        page.getByRole("heading", { level: 2, name: "Omnileaf" }),
      );

      expect(icon.x + icon.width / 2).toBeCloseTo(title.x + title.width / 2, 0);
      expect(title.y).toBeGreaterThan(icon.y + icon.height);
    });
  });
}

test.describe("in a desktop window under 600px", () => {
  test.use(onPlatform("linux"));

  test("keeps the copy button inside the window in a longer language", async ({
    page,
  }) => {
    const { width } = viewportOf(page);
    test.skip(width >= MEDIUM_MIN_WIDTH, "under 600px only");
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await page.goto(ABOUT_PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("⟦");

    const button = await boxOf(versionRowButton(page));

    expect(button.x + button.width).toBeLessThanOrEqual(width);
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      testOnlyInItsWebview(platform);
      test.use(onPlatform(platform));

      test(`Settings › About has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openAbout(page);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    });
  }
}

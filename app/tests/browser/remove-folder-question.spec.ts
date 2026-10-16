import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  tokenColour,
  transitionsOf,
  viewportOf,
  watchTransitions,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const LOST: MissingFolder = {
  folder: {
    id: "5a4d1e00-0000-4000-8002-000000000002",
    kind: "linked",
    name: "Sample Comics",
    location: "/media/Sample Comics",
    isAvailable: false,
  },
  problem: { kind: "lostAccess" },
  hiddenSeries: 41,
  isShownAnyway: false,
} as MissingFolder;
const DIALOG_BUTTON_HEIGHT = 40;
const SHEET_BUTTON_HEIGHT = 52;
const SHEET_INSET = 20;

let missing: MissingFolder[] = [];

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  missingLibraryFolders: () => missing,
  libraryHiddenSeriesCount: () => (missing.length > 0 ? 41 : 0),
  removeLibraryFolder: () => {
    missing = [];
    return null;
  },
  libraryFolderBookCount: () => 342,
};

test.use({ backend: BACKEND });
test.beforeEach(() => {
  missing = [LOST];
});

function lostNotice(page: Page): Locator {
  return page.getByRole("listitem").filter({
    has: page.getByText("Omnileaf can’t open Sample Comics", { exact: true }),
  });
}

function unlink(page: Page): Locator {
  return lostNotice(page).getByRole("button", { name: "Unlink it" });
}

async function askToRemove(page: Page): Promise<Locator> {
  await page.goto("/");
  await unlink(page).click();
  const question = page.getByRole("alertdialog", {
    name: "Remove this folder?",
  });
  await expect(question).toBeVisible();
  return question;
}

test("slides the removal question up on a phone and fades it in on wider screens, which reduced motion turns into appearing at once", async ({
  page,
}) => {
  await page.goto("/");
  const question = page.getByRole("alertdialog");
  const transitions = await watchTransitions(page);

  await unlink(page).click();

  await expect
    .poll(transitions)
    .toContain(
      viewportOf(page).width < MEDIUM_MIN_WIDTH
        ? "alertdialog translate"
        : "alertdialog opacity",
    );
  await page.keyboard.press("Escape");
  await expect(question).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await unlink(page).click();
  await expect(question).toBeVisible();
  expect(await transitionsOf(question)).toEqual([]);
});

test("keeps the folder when the removal is dismissed with Escape", async ({
  page,
}) => {
  const question = await askToRemove(page);

  await page.keyboard.press("Escape");

  await expect(question).toBeHidden();
  await expect(lostNotice(page)).toBeVisible();
});

test("keeps the folder when a tap lands outside the removal question", async ({
  page,
}) => {
  const question = await askToRemove(page);

  await page.mouse.click(8, 8);

  await expect(question).toBeHidden();
  await expect(lostNotice(page)).toBeVisible();
});

test("keeps the removal question open when a press inside it ends outside", async ({
  page,
}) => {
  const question = await askToRemove(page);
  const title = await boxOf(question.getByRole("heading"));

  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.mouse.move(8, 8);
  await page.mouse.up();

  await expect(question).toBeVisible();
});

test("shows the folder and its books in the removal question", async ({
  page,
}) => {
  const question = await askToRemove(page);

  await expect(
    question.getByText("Sample Comics", { exact: true }),
  ).toBeVisible();
  await expect(
    question.getByText("/media/Sample Comics · 342 books"),
  ).toBeVisible();
  await expect(
    question.getByText(
      "Its books leave your library. The files stay where they are, and you can add the folder again.",
    ),
  ).toBeVisible();
});

test("marks the removal question with a round danger badge", async ({
  page,
}) => {
  const question = await askToRemove(page);
  await settle(question);

  const badge = question.locator("span:has(> svg.lucide-folder-minus)");
  await expect(badge).toHaveCSS(
    "background-color",
    await tokenColour(page, "--color-danger-soft"),
  );
  const { width, height } = await boxOf(badge);
  const radius = await badge.evaluate((element) =>
    parseFloat(getComputedStyle(element).borderRadius),
  );
  expect(width).toBe(height);
  expect(radius).toBeGreaterThanOrEqual(width / 2);
});

test.describe("from medium screens up", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < MEDIUM_MIN_WIDTH,
    "screens with room for a dialog",
  );

  test("puts Cancel and Remove folder side by side at equal widths", async ({
    page,
  }) => {
    const question = await askToRemove(page);
    await settle(question);

    const cancel = await boxOf(
      question.getByRole("button", { name: "Cancel" }),
    );
    const remove = await boxOf(
      question.getByRole("button", { name: "Remove folder" }),
    );

    expect(cancel.x + cancel.width).toBeLessThan(remove.x);
    expect(cancel.y).toBe(remove.y);
    expect(cancel.width).toBeCloseTo(remove.width, 0);
    expect([cancel.height, remove.height]).toEqual([
      DIALOG_BUTTON_HEIGHT,
      DIALOG_BUTTON_HEIGHT,
    ]);
  });
});

test.describe("on phones", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= MEDIUM_MIN_WIDTH,
    "phone-width screens only",
  );

  test("stacks Remove folder above Cancel across the sheet", async ({
    page,
  }) => {
    const question = await askToRemove(page);
    await settle(question);
    const sheet = await boxOf(question);

    const remove = await boxOf(
      question.getByRole("button", { name: "Remove folder" }),
    );
    const cancel = await boxOf(
      question.getByRole("button", { name: "Cancel" }),
    );

    expect(remove.y + remove.height).toBeLessThan(cancel.y);
    for (const button of [remove, cancel]) {
      expect(button.x).toBe(sheet.x + SHEET_INSET);
      expect(button.width).toBe(sheet.width - 2 * SHEET_INSET);
      expect(button.height).toBe(SHEET_BUTTON_HEIGHT);
    }
  });
});

test.describe("with a pointer", () => {
  test.skip(({ isMobile }) => isMobile, "pointer screens only");

  for (const name of ["Remove folder", "Cancel"]) {
    test(`tints the question's ${name} button under the pointer`, async ({
      page,
    }) => {
      const question = await askToRemove(page);
      const button = question.getByRole("button", { name });
      await settle(button);
      const paint = () =>
        button.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.backgroundColor} ${style.backgroundImage}`;
        });
      const resting = await paint();

      await button.hover();
      await settle(button);

      expect(await paint()).not.toBe(resting);
    });
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the removal question has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await askToRemove(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

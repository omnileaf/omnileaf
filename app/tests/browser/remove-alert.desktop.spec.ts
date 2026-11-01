import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);
const ALERT_WIDTH = 260;
const ALERT_CORNER = "34px";
const ALERT_ICON_SIZE = 54;
const ALERT_PADDING_TOP = 20;
const ALERT_PADDING_INLINE = 16;
const ALERT_TITLE_SIZE = "13px";
const ALERT_TEXT_SIZE = "11px";
const ALERT_BUTTON_HEIGHT = 28;
const ALERT_BUTTON_GAP = 6;
const ALERT_BUTTON_WIDTH = ALERT_WIDTH - 2 * ALERT_PADDING_INLINE;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

let removed: boolean[] = [];

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...LIBRARY], next: null }),
  librarySeriesCount: () => LIBRARY.length,
  seriesLabels: () => ({
    keepsLabels: true,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
  previewRemoval: (targets) => ({
    books: targets.length * 3,
    files: targets.length * 3,
    folders: 2,
  }),
  removeFromLibrary: (targets, deleteFiles) => {
    removed = [...removed, deleteFiles];
    return {
      removedSeries: targets.length,
      removedBooks: targets.length * 3,
      files: [],
    };
  },
};

testOnlyInItsWebview("macos");
test.use({ backend: BACKEND, viewport: { width: 1280, height: 800 } });

test.beforeEach(() => {
  removed = [];
});

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function cornerOf(button: Locator): Promise<number> {
  return button.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
}

async function showCovers(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
}

async function removeDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openFromMenu(page: Page): Promise<Locator> {
  await showCovers(page);
  await covers(page)
    .locator("[data-pickable-link]")
    .nth(1)
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Remove from library/ }).click();
  return removeDialog(page);
}

test.describe("the Remove from library alert on a Mac", () => {
  test.use({ platform: "macos" });

  test("is a 260pt alert with 34pt corners and the app icon on top", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);

    const frame = await boxOf(dialog);
    const icon = await boxOf(dialog.locator("img"));
    expect(frame.width).toBeCloseTo(ALERT_WIDTH, 0);
    await expect(dialog).toHaveCSS("border-top-left-radius", ALERT_CORNER);
    expect(icon.width).toBeCloseTo(ALERT_ICON_SIZE, 0);
    expect(icon.height).toBeCloseTo(ALERT_ICON_SIZE, 0);
    expect(icon.y - frame.y).toBeCloseTo(ALERT_PADDING_TOP, 0);
  });

  test("sets the title at 13px bold and the message at 11px", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);

    const title = dialog.getByRole("heading", {
      name: "Remove from your library?",
    });
    await expect(title).toHaveCSS("font-size", ALERT_TITLE_SIZE);
    await expect(title).toHaveCSS("font-weight", "700");
    await expect(dialog.getByText("1 series leaves your library.")).toHaveCSS(
      "font-size",
      ALERT_TEXT_SIZE,
    );
  });

  test("stacks Remove above Cancel as full-width capsules", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);
    const remove = dialog.getByRole("button", { name: "Remove", exact: true });
    const cancel = dialog.getByRole("button", { name: "Cancel" });

    const top = await boxOf(remove);
    const bottom = await boxOf(cancel);

    expect(top.height).toBeCloseTo(ALERT_BUTTON_HEIGHT, 0);
    expect(bottom.height).toBeCloseTo(ALERT_BUTTON_HEIGHT, 0);
    expect(top.width).toBeCloseTo(ALERT_BUTTON_WIDTH, 0);
    expect(bottom.y - (top.y + top.height)).toBeCloseTo(ALERT_BUTTON_GAP, 0);
    expect(await cornerOf(remove)).toBeGreaterThanOrEqual(
      ALERT_BUTTON_HEIGHT / 2,
    );
    expect(await cornerOf(cancel)).toBeGreaterThanOrEqual(
      ALERT_BUTTON_HEIGHT / 2,
    );
  });

  test("fills Remove in the accent and not in red, Cancel in the control fill", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);

    await expect(
      dialog.getByRole("button", { name: "Remove", exact: true }),
    ).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-control-fill-hover"),
    );
  });

  test("leaves the window behind undimmed", async ({ page }) => {
    await openFromMenu(page);

    await expect(
      page.locator("[data-dialog-overlay], [data-alert-dialog-overlay]"),
    ).toHaveCSS("background-color", TRANSPARENT);
  });

  test("puts the unticked files checkbox under the message", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);
    const checkbox = dialog.getByRole("checkbox", {
      name: "Also delete the files from disk",
    });

    await expect(checkbox).not.toBeChecked();
    const message = await boxOf(
      dialog.getByText("1 series leaves your library."),
    );
    const accessory = await boxOf(checkbox);
    expect(accessory.y).toBeGreaterThan(message.y + message.height);
  });

  test("names the files that go once the checkbox is ticked, and the action says so", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);

    await dialog
      .getByRole("checkbox", { name: "Also delete the files from disk" })
      .click();

    await expect(dialog).toContainText("3 files in 2 folders");
    await expect(
      dialog.getByRole("button", { name: "Delete files" }),
    ).toBeVisible();
  });

  test("confirms with Return, since Remove is the default button", async ({
    page,
  }) => {
    const dialog = await openFromMenu(page);
    await expect(
      dialog.getByRole("button", { name: "Remove", exact: true }),
    ).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(dialog).toBeHidden();
    expect(removed).toEqual([false]);
  });

  test("leaves everything alone when Cancel is pressed", async ({ page }) => {
    const dialog = await openFromMenu(page);

    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    expect(removed).toEqual([]);
  });
});

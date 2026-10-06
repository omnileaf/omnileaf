import type { Locator } from "@playwright/test";

import {
  addFolderBesideFolders,
  addFolderInPageHeading,
  CONTROLS,
  DESKTOP,
  destination,
  THEME_OPTION,
  WITH_THE_PICKER_OPEN,
} from "./controls.ts";
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { boxOf, expect, onPlatform, settle, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions, viewOptionsButton } from "./view-options.ts";

const POINTER_TARGET = 40;

const WITH_A_LINKED_FOLDER: FakeBackend = {
  ...DESKTOP,
  libraryFolders: () => ({
    folders: [
      {
        id: "2",
        kind: "linked",
        name: "Sample Comics",
        location: "/media/Sample Comics",
        isAvailable: true,
      },
    ],
    next: null,
  }),
  addLibraryFolder: () => ({
    name: "Sample Library",
    series: 1,
    books: 3,
    unreadableBooks: 0,
    unsupportedBooks: 0,
    unreadableFolders: 0,
  }),
};

const PRESSABLE_CONTROLS = CONTROLS.filter(
  (control) => control !== THEME_OPTION,
);

async function paintOf(locator: Locator, pseudo?: "::before"): Promise<string> {
  await settle(locator);
  return locator.evaluate((element, part) => {
    const style = getComputedStyle(element, part);
    return `${style.backgroundColor} ${style.backgroundImage}`;
  }, pseudo);
}

function backgroundColorOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
}

async function inkOf(locator: Locator): Promise<string> {
  await settle(locator);
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.color} ${style.opacity}`;
  });
}

test.describe("with a pointer", () => {
  test.use({ backend: DESKTOP });
  test.skip(({ isMobile }) => isMobile, "pointer screens only");

  for (const { name, path, find } of CONTROLS) {
    test(`tints ${name} while the pointer is over it`, async ({ page }) => {
      await page.goto(path);
      const control = find(page);
      const resting = await paintOf(control);

      await control.hover();

      expect(await paintOf(control)).not.toBe(resting);
    });
  }

  for (const { name, path, find } of PRESSABLE_CONTROLS) {
    test(`deepens the tint while ${name} is pressed`, async ({ page }) => {
      await page.goto(path);
      const control = find(page);
      await control.hover();
      const hovered = await paintOf(control);

      await page.mouse.down();

      expect(await paintOf(control)).not.toBe(hovered);
    });
  }

  test("keeps an outlined button's card under its tint", async ({ page }) => {
    await page.goto("/");
    const button = addFolderInPageHeading(page);
    const card = await backgroundColorOf(button);

    await button.hover();

    expect(await backgroundColorOf(button)).toBe(card);
  });

  test("keeps the selected destination's look under the pointer", async ({
    page,
  }) => {
    await page.goto("/");
    const library = destination(page, "Library");
    const resting = await paintOf(library);

    await library.hover();

    expect(await paintOf(library)).toBe(resting);
  });

  test.describe("with a linked folder", () => {
    test.use({ backend: WITH_A_LINKED_FOLDER });

    test("brings a row action's ink up to the foreground under the pointer", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const remove = page.getByRole("button", {
        name: "Remove Sample Comics",
      });
      const resting = await inkOf(remove);

      await remove.hover();

      expect(await inkOf(remove)).not.toBe(resting);
    });

    test("draws a 40px circle behind a row action under the pointer", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const remove = page.getByRole("button", {
        name: "Remove Sample Comics",
      });
      const resting = await paintOf(remove, "::before");

      await remove.hover();

      const circle = await remove.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
          width: parseFloat(style.inlineSize),
          height: parseFloat(style.blockSize),
        };
      });
      expect(await paintOf(remove, "::before")).not.toBe(resting);
      expect(circle).toEqual({ width: POINTER_TARGET, height: POINTER_TARGET });
    });

    for (const name of ["Remove folder", "Cancel"]) {
      test(`tints the dialog's ${name} button under the pointer`, async ({
        page,
      }) => {
        await page.goto("/settings/library");
        await page
          .getByRole("button", { name: "Remove Sample Comics" })
          .click();
        const button = page
          .getByRole("alertdialog")
          .getByRole("button", { name });
        const resting = await paintOf(button);

        await button.hover();

        expect(await paintOf(button)).not.toBe(resting);
      });
    }

    test("draws a 40px circle behind an icon button under the pointer", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      await addFolderBesideFolders(page).click();
      const dismiss = page
        .getByRole("main")
        .getByRole("status")
        .getByRole("button", { name: "Dismiss" });
      const resting = await paintOf(dismiss, "::before");
      const restingInk = await inkOf(dismiss);

      await dismiss.hover();

      const circle = await dismiss.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
          width: parseFloat(style.inlineSize),
          height: parseFloat(style.blockSize),
          radius: style.borderRadius,
        };
      });
      expect(await paintOf(dismiss, "::before")).not.toBe(resting);
      expect(await inkOf(dismiss)).not.toBe(restingInk);
      expect(circle.width).toBe(POINTER_TARGET);
      expect(circle.height).toBe(POINTER_TARGET);
      expect(circle.radius).not.toBe("0px");
    });

    test("keeps an icon button's target its size under the pointer", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      await addFolderBesideFolders(page).click();
      const dismiss = page
        .getByRole("main")
        .getByRole("status")
        .getByRole("button", { name: "Dismiss" });
      const before = await boxOf(dismiss);

      await dismiss.hover();

      expect(await boxOf(dismiss)).toEqual(before);
    });
  });

  test.describe("with series in the library", () => {
    test.use({
      backend: {
        ...DESKTOP,
        librarySeries: pagedSeries(() => sampleSeries(3)),
        libraryView: () => DEFAULT_LIBRARY_VIEW,
        setLibraryView: () => null,
        librarySeriesCount: () => 3,
      },
    });

    test("tints the view options button under the pointer", async ({
      page,
    }) => {
      await page.goto("/");
      const button = viewOptionsButton(page);
      const resting = await paintOf(button);

      await button.hover();

      expect(await paintOf(button)).not.toBe(resting);
    });

    for (const [name, find] of [
      [
        "an unchosen display",
        (options: Locator) =>
          options.locator("label").filter({ hasText: "List" }),
      ],
      [
        "a covers per row step",
        (options: Locator) =>
          options.getByRole("button", { name: "More covers per row" }),
      ],
    ] as const) {
      test(`tints ${name} under the pointer`, async ({ page }) => {
        await page.goto("/");
        const control = find(await openViewOptions(page));
        await page.mouse.move(0, 0);
        const resting = await paintOf(control);

        await control.hover();

        expect(await paintOf(control)).not.toBe(resting);
      });
    }
  });

  test.describe("on a first launch", () => {
    test.use({ backend: { ...DESKTOP, firstLaunchFinished: () => false } });

    test("tints the step's main button under the pointer", async ({ page }) => {
      await page.goto("/first-launch");
      const start = page.getByRole("button", { name: "Get started" });
      const resting = await paintOf(start);

      await start.hover();

      expect(await paintOf(start)).not.toBe(resting);
    });

    test("tints Back under the pointer", async ({ page }) => {
      await page.goto("/first-launch");
      await page.getByRole("button", { name: "Get started" }).click();
      await page.mouse.move(0, 0);
      const back = page.getByRole("button", { name: "Back" }).last();
      const resting = await paintOf(back);

      await back.hover();

      expect(await paintOf(back)).not.toBe(resting);
    });

    test("tints a quiet step button under the pointer", async ({ page }) => {
      await page.goto("/first-launch");
      await page.getByRole("button", { name: "Get started" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.mouse.move(0, 0);
      const skip = page.getByRole("button", { name: "Skip for now" });
      const resting = await paintOf(skip);

      await skip.hover();

      expect(await paintOf(skip)).not.toBe(resting);
    });
  });

  test.describe("while the folder picker is open", () => {
    test.use({ backend: WITH_THE_PICKER_OPEN });

    test("leaves the disabled button untinted under the pointer", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const button = addFolderBesideFolders(page);
      const resting = await paintOf(button);

      await button.click();
      await expect(button).toBeDisabled();

      expect(await paintOf(button)).toBe(resting);
    });
  });
});

test.describe("on a touch screen", () => {
  test.use(onPlatform("android"));
  test.skip(({ isMobile }) => !isMobile, "touch screens only");

  test("leaves no hover tint on a button", async ({ page }) => {
    await page.goto("/settings/library");
    const button = addFolderBesideFolders(page);
    const resting = await paintOf(button);

    await button.hover();

    expect(await paintOf(button)).toBe(resting);
  });
});

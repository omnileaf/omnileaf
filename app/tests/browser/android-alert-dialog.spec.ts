import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: "", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => DETAILS,
};

test.use({ backend: BACKEND });

test.describe(
  "a confirmation dialog on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material dialog");
    });

    async function openDiscard(page: import("@playwright/test").Page) {
      await page.goto(`/series/${SERIES_ID}`);
      await page
        .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Edit details…" }).click();
      await page
        .getByRole("textbox", { name: "Title" })
        .fill("A different title");
      await page.getByRole("button", { name: "Close" }).click();
      const dialog = page.getByRole("alertdialog", {
        name: "Discard your changes?",
      });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test("draws the dialog on the dialog surface with 28px corners and 24px of padding", async ({
      page,
    }) => {
      const dialog = await openDiscard(page);

      await expect(dialog).toHaveCSS("border-top-left-radius", "28px");
      await expect(dialog).toHaveCSS("padding-left", "24px");
      await expect(dialog).toHaveCSS("padding-top", "24px");
      await expect(dialog).toHaveCSS(
        "background-color",
        await tokenColour(page, "--dialog-surface"),
      );
    });

    test("sets the title at 24px on a 32px line, starting at the left,", async ({
      page,
    }) => {
      const dialog = await openDiscard(page);
      const title = dialog.getByRole("heading", {
        name: "Discard your changes?",
      });

      await expect(title).toHaveCSS("font-size", "24px");
      await expect(title).toHaveCSS("line-height", "32px");
      await expect(title).toHaveCSS("font-weight", "400");
      expect((await boxOf(title)).x - (await boxOf(dialog)).x).toBeCloseTo(
        24,
        0,
      );
    });

    test("ends the dialog with Keep editing and Discard as text buttons, with their boxes 24px from the end", async ({
      page,
    }) => {
      const dialog = await openDiscard(page);
      const keep = dialog.getByRole("button", { name: "Keep editing" });
      const discard = dialog.getByRole("button", { name: "Discard" });
      const accent = await tokenColour(page, "--native-color-on-button-plain");

      await expect(keep).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(discard).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(keep).toHaveCSS("color", accent);
      await expect(discard).toHaveCSS("color", accent);
      const dialogBox = await boxOf(dialog);
      const discardBox = await boxOf(discard);
      expect(
        dialogBox.x + dialogBox.width - (discardBox.x + discardBox.width),
      ).toBeCloseTo(24, 0);
      expect((await boxOf(keep)).x).toBeLessThan(discardBox.x);
    });
  },
);

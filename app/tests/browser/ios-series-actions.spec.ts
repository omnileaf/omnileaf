import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  fakeAppInfo,
  test,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const ICON_SIZE = 17;
const CHEVRON_SIZE = 13;

const shelf = new FakeShelf(
  [{ state: "read" }, { state: "notStarted" }],
  { format: "Manga", creators: [], summary: null, tags: [] },
  100,
);

test.use({
  backend: { ...shelf.backend(), appInfo: () => fakeAppInfo("ios") },
});

test(
  "draws the reading state, tags and mark icons 17px with a 13px chevron on an iPhone",
  { tag: "@native" },
  async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's phone actions");
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "the phone's actions",
    );
    await page.goto(`/series/${SERIES_ID}`);
    const state = page.getByRole("button", { name: /^Reading state/ });
    await expect(state).toBeVisible();

    const icons = state.locator("[data-icon]");
    const book = await boxOf(icons.first());
    const chevron = await boxOf(icons.last());

    expect(book.width).toBeCloseTo(ICON_SIZE, 0);
    expect(chevron.width).toBeCloseTo(CHEVRON_SIZE, 0);
    for (const name of [/^Tags for/, /^Mark .* read$/]) {
      const icon = await boxOf(
        page.getByRole("button", { name }).locator("[data-icon]").first(),
      );
      expect(icon.width).toBeCloseTo(ICON_SIZE, 0);
    }
  },
);

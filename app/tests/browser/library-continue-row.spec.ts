import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { choose, openViewOptions } from "./view-options.ts";

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => sampleSeries(12)),
    libraryView: () => storedView,
    setLibraryView: (view) => {
      storedView = view;
      return null;
    },
  },
});

test.beforeEach(() => {
  storedView = DEFAULT_LIBRARY_VIEW;
});

test("keeps the Continue reading row off until it's turned on in View options", async ({
  page,
}) => {
  await page.goto("/");
  const options = await openViewOptions(page);
  const onThePage = options.getByRole("group", {
    name: "On the library page",
  });
  await expect(onThePage.getByLabel("Continue reading row")).not.toBeChecked();

  await choose(onThePage, "Continue reading row");

  await expect(onThePage.getByLabel("Continue reading row")).toBeChecked();
  await expect.poll(() => storedView.showsContinueRow).toBe(true);
});

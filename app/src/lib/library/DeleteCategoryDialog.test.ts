import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import DeleteCategoryDialog from "./DeleteCategoryDialog.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function askAbout(seriesCount: number | undefined): Promise<HTMLElement> {
  followCorePlatform("linux");
  await render(DeleteCategoryDialog, {
    props: {
      category: { name: "Plan to read", seriesCount },
      isBusy: false,
      onDelete: () => undefined,
      onCancel: () => undefined,
      onCloseAutoFocus: () => undefined,
    },
  });
  const ask = page.getByRole("alertdialog", { name: "Delete Plan to read?" });
  await expect.element(ask).toBeVisible();
  return ask.element() as HTMLElement;
}

test("says how many series stay in the library", async () => {
  const ask = await askAbout(12);

  expect(ask.textContent).toContain("Its 12 series stay in your library.");
});

test("asks only the question for a category with no series", async () => {
  const ask = await askAbout(0);

  expect(ask.textContent).not.toContain("stay in your library");
});

test("says the series stay when their number is not known", async () => {
  const ask = await askAbout(undefined);

  expect(ask.textContent).toContain("Its series stay in your library.");
});

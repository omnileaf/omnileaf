import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { SeriesBookListing } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import BookListingChoices from "./BookListingChoices.svelte";

const DESKTOP = { width: 1440, height: 900 } as const;
const LISTING: SeriesBookListing = { shown: "all", direction: "ascending" };

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function listingOn(
  platform: "macos" | "linux",
  size: { width: number; height: number } = DESKTOP,
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  document.body.append(document.createElement("main"));
  await render(BookListingChoices, {
    phone: undefined,
    listing: LISTING,
    onChoose: () => undefined,
    search: "",
    onSearch: () => undefined,
    onShownCrowded: () => undefined,
  });
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the control drew no element");
  }
  return element;
}

test("draws Show as macOS's 24 point segmented control with a visible label", async () => {
  await listingOn("macos");

  const group = asElement(
    page.getByRole("radiogroup", { name: "Show" }).element(),
  );
  const chosen = getComputedStyle(
    asElement(page.getByRole("radio", { name: "All" }).element()),
  );

  expect(group.getBoundingClientRect().height).toBe(24);
  expect(chosen.backgroundColor).toBe(
    resolvedColour("--color-accent", "backgroundColor"),
  );
  await expect.element(page.getByText("Show", { exact: true })).toBeVisible();
});

test("draws Sort as macOS's 24 point secondary button", async () => {
  await listingOn("macos");

  const sort = asElement(page.getByRole("button", { name: /^Sort/ }).element());
  const style = getComputedStyle(sort);

  expect({
    height: sort.getBoundingClientRect().height,
    fill: style.backgroundColor,
  }).toEqual({
    height: 24,
    fill: resolvedColour("--color-native-button-secondary", "backgroundColor"),
  });
});

test("keeps Show as toggles and Sort as the outline button on Linux", async () => {
  await listingOn("linux");

  await expect
    .element(page.getByRole("radiogroup", { name: "Show" }))
    .not.toBeInTheDocument();
  expect(
    asElement(
      page.getByRole("button", { name: /^Sort/ }).element(),
    ).getBoundingClientRect().height,
  ).toBeGreaterThan(24);
});

test("keeps the search reachable on a narrow macOS window", async () => {
  await listingOn("macos", { width: 700, height: 900 });

  await expect
    .element(page.getByRole("button", { name: "Find a book" }))
    .toBeVisible();
});

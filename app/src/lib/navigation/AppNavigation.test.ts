import type { ComponentProps } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode.ts";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import AppNavigation from "./AppNavigation.svelte";
import type { Section } from "./sections.ts";

const NavigationWithAppContext = WithAppContext<
  ComponentProps<typeof AppNavigation>
>;

function renderNavigation(current: Section) {
  return render(NavigationWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: AppNavigation,
    pageProps: { current },
  });
}

const SECTION_LABELS = ["Library", "Browse", "History", "Settings"];

test("links to every section", async () => {
  const screen = await renderNavigation("library");

  const navigation = screen.getByRole("navigation", { name: "Main" });

  for (const label of SECTION_LABELS) {
    await expect
      .element(navigation.getByRole("link", { name: label }))
      .toBeVisible();
  }
});

test("marks only the current section as the current page", async () => {
  const screen = await renderNavigation("history");

  await expect
    .element(screen.getByRole("link", { name: "History" }))
    .toHaveAttribute("aria-current", "page");
  for (const label of ["Library", "Browse", "Settings"]) {
    await expect
      .element(screen.getByRole("link", { name: label }))
      .not.toHaveAttribute("aria-current");
  }
});

test("fills only the current section's icon", async () => {
  const screen = await renderNavigation("browse");

  const filledIn = (label: string) =>
    screen
      .getByRole("link", { name: label })
      .element()
      .querySelector('svg [fill="currentColor"]') !== null;

  expect(filledIn("Browse")).toBe(true);
  for (const label of ["Library", "History", "Settings"]) {
    expect(filledIn(label)).toBe(false);
  }
});

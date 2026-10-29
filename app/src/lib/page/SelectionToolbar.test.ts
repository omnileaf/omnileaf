import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "./platform";
import SelectionToolbarHarness from "./SelectionToolbarHarness.svelte";

function renderToolbar() {
  return render(SelectionToolbarHarness, {
    label: "Selected books",
    count: "3 books",
  });
}

function toolbar(): HTMLElement {
  const element = page.getByRole("group", { name: "Selected books" }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the toolbar drew no element");
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("names the toolbar and shows the count and its children", async () => {
  await renderToolbar();

  await expect
    .element(page.getByRole("group", { name: "Selected books" }))
    .toHaveTextContent("3 books Mark read");
});

test("draws the toolbar as a glass capsule on iOS and macOS", async () => {
  for (const platform of ["ios", "macos"] as const) {
    followCorePlatform(platform);
    await renderToolbar();
    const bar = toolbar();
    const style = getComputedStyle(bar);
    const isCapsule =
      Number.parseFloat(style.borderTopLeftRadius) >=
      bar.getBoundingClientRect().height / 2;

    expect({
      isCapsule,
      hasNoVisibleBorder: style.borderTopColor === "rgba(0, 0, 0, 0)",
      isBlurred: style.backdropFilter !== "none",
    }).toEqual({ isCapsule: true, hasNoVisibleBorder: true, isBlurred: true });

    document.body.replaceChildren();
  }
});

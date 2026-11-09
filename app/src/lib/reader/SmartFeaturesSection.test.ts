import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SmartFeaturesSection from "./SmartFeaturesSectionHarness.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("sets the Android settings section flush, headed in the accent with 44px, its rows at 16px", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();
  const row = screen.getByRole("switch").first().element();
  const label = screen.getByText("Learn my reading speed").element();

  expect(heading.getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(getComputedStyle(heading).fontSize).toBe("14px");
  expect(getComputedStyle(heading).fontWeight).toBe("500");
  expect(getComputedStyle(row).borderTopWidth).toBe("0px");
  expect(getComputedStyle(label).letterSpacing).toBe("0.5px");
  expect(
    label.getBoundingClientRect().left - row.getBoundingClientRect().left,
  ).toBeCloseTo(16, 0);
});

test("keeps the compact sheet heading semibold on Android phones", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, { heading: "h3" });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();

  expect(getComputedStyle(heading).fontWeight).toBe("600");
});

test("keeps the bordered rows off Android", async () => {
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();

  expect(getComputedStyle(heading).fontWeight).toBe("600");
});

test("disables the Android time left switch once reading speed is off", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  await screen.getByRole("button", { name: "Turn all off" }).click();

  await expect
    .element(screen.getByRole("switch", { name: "Show time left" }))
    .toBeDisabled();
});

test("turns a single Android switch off when it is pressed", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });
  const toggle = screen.getByRole("switch", { name: "Learn my reading speed" });
  await expect.element(toggle).toBeChecked();

  await toggle.click();

  await expect.element(toggle).not.toBeChecked();
  await expect
    .element(screen.getByRole("switch", { name: /^Choose the reading mode/ }))
    .toBeChecked();
});

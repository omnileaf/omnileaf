import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SectionHeading from "./SectionHeading.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const PROPS = { title: "About" };
const EXPANDED_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const PHONE_WIDTH = 400;
const TABLET_WIDTH = 800;

test("titles the page", async () => {
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "About" }))
    .toBeVisible();
});

test("links back to settings", async () => {
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(screen.getByRole("link", { name: "Back to Settings" }))
    .toHaveAttribute("href", "/settings");
});

test("links back to the page it sits under", async () => {
  const screen = await render(SectionHeading, {
    title: "Language",
    parent: { route: "/(app)/settings/general", title: "General" },
  });

  const back = screen.getByRole("link", { name: "Back to General" });

  await expect.element(back).toHaveAttribute("href", "/settings/general");
  await expect.element(back).toHaveTextContent("General");
});

test("hides the way back to settings beside the list of sections", async () => {
  await page.viewport(EXPANDED_WIDTH, VIEWPORT_HEIGHT);
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(
      screen.getByRole("link", {
        name: "Back to Settings",
        includeHidden: true,
      }),
    )
    .not.toBeVisible();
});

test("keeps the way back to the page it sits under beside the list of sections", async () => {
  await page.viewport(EXPANDED_WIDTH, VIEWPORT_HEIGHT);
  const screen = await render(SectionHeading, {
    title: "Screenshot mode",
    parent: { route: "/(app)/settings/privacy", title: "Privacy and security" },
  });

  await expect
    .element(screen.getByRole("link", { name: "Back to Privacy and security" }))
    .toBeVisible();
});

test("renders native back Icon on Android", async () => {
  followCorePlatform("android");
  const screen = await render(SectionHeading, PROPS);
  const icon = screen.container.querySelector('[data-icon="arrow-left"]');
  expect(icon).not.toBeNull();
});

test("sizes back button to 40px × 40px on Android", async () => {
  await page.viewport(PHONE_WIDTH, VIEWPORT_HEIGHT);
  followCorePlatform("android");
  const screen = await render(SectionHeading, PROPS);
  const back = screen.getByRole("link", { name: "Back to Settings" }).element();
  expect(back.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(back.getBoundingClientRect().width).toBeCloseTo(40, 0);
});

test("sets the title under the back button on Android phones", async () => {
  await page.viewport(PHONE_WIDTH, VIEWPORT_HEIGHT);
  followCorePlatform("android");
  const screen = await render(SectionHeading, PROPS);

  const back = screen.getByRole("link", { name: "Back to Settings" }).element();
  const title = screen.getByRole("heading", { level: 1 }).element();

  expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    back.getBoundingClientRect().bottom,
  );
});

test("sets the title on a 32px line on Android phones", async () => {
  await page.viewport(PHONE_WIDTH, VIEWPORT_HEIGHT);
  followCorePlatform("android");
  const screen = await render(SectionHeading, PROPS);

  const style = getComputedStyle(
    screen.getByRole("heading", { level: 1 }).element(),
  );

  expect(style.lineHeight).toBe("32px");
});

test("keeps the back button's tablet offset on Android tablets", async () => {
  await page.viewport(TABLET_WIDTH, VIEWPORT_HEIGHT);
  followCorePlatform("android");
  const screen = await render(SectionHeading, PROPS);

  const back = screen.getByRole("link", { name: "Back to Settings" }).element();
  const style = getComputedStyle(back);

  expect(Number.parseFloat(style.marginInlineStart)).toBeLessThan(0);
  expect(style.marginBlockStart).toBe("0px");
});

import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import type { FirstLaunchStep } from "./steps";
import StepFrame from "./StepFrame.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const nothing = createRawSnippet(() => ({ render: () => "<span></span>" }));

async function renderFrameOn(step: FirstLaunchStep) {
  let backs = 0;
  const screen = await render(StepFrame, {
    step,
    onBack: () => {
      backs += 1;
    },
    children: nothing,
    actions: nothing,
  });
  return { screen, backs: () => backs };
}

test("says where the step is among the numbered steps", async () => {
  const { screen } = await renderFrameOn("link");

  const progress = screen.getByRole("progressbar", { name: "Setting up" });

  await expect.element(progress).toHaveAttribute("aria-valuenow", "2");
  await expect.element(progress).toHaveAttribute("aria-valuetext", "2 of 3");
  await expect.element(progress).toHaveTextContent("2 of 3");
});

test("goes back once when Back is pressed", async () => {
  const { screen, backs } = await renderFrameOn("choices");

  await screen.getByRole("button", { name: "Back" }).first().click();

  expect(backs()).toBe(1);
});

test("shows no progress on the steps around the numbered ones", async () => {
  const { screen } = await renderFrameOn("ready");

  const progress = screen.getByRole("progressbar");

  expect(progress.elements()).toHaveLength(0);
});

test("sizes back button to 40px and renders native arrow icon on Android", async () => {
  followCorePlatform("android");
  const { screen } = await renderFrameOn("choices");

  const back = screen.getByRole("button", { name: "Back" }).first().element();
  expect(back.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(back.getBoundingClientRect().width).toBeCloseTo(40, 0);
  expect(back.querySelector('[data-icon="arrow-left"]')).not.toBeNull();
});

const PROGRESS_BAR_HEIGHT = 4;
const BACK_TO_BAR_GAP = 12;

test("draws the step as a 4px bar beside a 12px count on Android", async () => {
  await page.viewport(400, 800);
  followCorePlatform("android");
  const { screen } = await renderFrameOn("home");

  const progress = screen.getByRole("progressbar").element();
  const bar = progress.querySelector("[data-fill]")?.parentElement;
  const count = screen.getByText("1 of 3").element();
  const style = getComputedStyle(count);

  const back = screen.getByRole("button", { name: "Back" }).first().element();

  expect(bar?.getBoundingClientRect().height).toBe(PROGRESS_BAR_HEIGHT);
  expect(
    (bar?.getBoundingClientRect().left ?? 0) -
      back.getBoundingClientRect().right,
  ).toBe(BACK_TO_BAR_GAP);
  expect(style.fontSize).toBe("12px");
  expect(style.lineHeight).toBe("16px");
  expect(style.letterSpacing).toBe("0.4px");
  expect(style.paddingLeft).toBe("8px");
  expect(style.paddingRight).toBe("16px");
});

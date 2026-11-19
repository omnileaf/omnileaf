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

const GUIDE_TITLE = "How folders are read";
const PHONE_WINDOW = { width: 400, height: 800 } as const;
const DIALOG_WINDOW = { width: 1280, height: 800 } as const;

async function renderTitledFrame(window: { width: number; height: number }) {
  await page.viewport(window.width, window.height);
  return render(StepFrame, {
    title: GUIDE_TITLE,
    onBack: () => undefined,
    children: nothing,
  });
}

test("sets a titled frame's title in the top bar beside Back, with no progress, on an Android phone", async () => {
  followCorePlatform("android");
  const screen = await renderTitledFrame(PHONE_WINDOW);

  const title = screen.getByRole("heading", { level: 1, name: GUIDE_TITLE });
  const style = getComputedStyle(title.element());

  expect(title.element().closest("header")).not.toBeNull();
  expect(screen.getByRole("progressbar").elements()).toHaveLength(0);
  expect([style.fontSize, style.lineHeight]).toEqual(["22px", "28px"]);
});

test("leaves the footer out on a phone when the frame has no actions", async () => {
  followCorePlatform("android");
  const screen = await renderTitledFrame(PHONE_WINDOW);

  expect(screen.container.querySelector("footer")).toBeNull();
});

test("keeps Back alone in the dialog's footer when the frame has no actions", async () => {
  const screen = await renderTitledFrame(DIALOG_WINDOW);

  const footer = screen.container.querySelector("footer");

  expect(footer?.querySelectorAll("button")).toHaveLength(1);
  expect(footer?.querySelector("button")?.textContent.trim()).toBe("Back");
  expect(footer?.querySelector(":scope > div")).toBeNull();
});

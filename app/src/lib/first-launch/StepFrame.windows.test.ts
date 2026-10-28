import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { FirstLaunchStep } from "./steps";
import StepFrame from "./StepFrame.svelte";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const NARROW_WINDOW = { width: 600, height: 800 } as const;

const action = createRawSnippet(() => ({
  render: () => "<button type='button'>Continue</button>",
}));
const nothing = createRawSnippet(() => ({ render: () => "<span></span>" }));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

async function renderFrameOnWindows(
  step: FirstLaunchStep,
  window: { width: number; height: number } = DESKTOP_WINDOW,
) {
  await page.viewport(window.width, window.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  return render(StepFrame, {
    step,
    onBack: () => undefined,
    children: nothing,
    actions: action,
  });
}

test.each([DESKTOP_WINDOW, NARROW_WINDOW])(
  "keeps Back once, at the top, at $width px on Windows",
  async (window) => {
    const screen = await renderFrameOnWindows("link", window);

    const backs = screen.getByRole("button", { name: "Back" }).elements();

    expect(backs).toHaveLength(1);
    expect(backs[0]?.closest("header")).not.toBeNull();
    expect(backs[0]?.closest("footer")).toBeNull();
  },
);

test("draws the step as a thin bar filled to its share with the count beside it", async () => {
  const screen = await renderFrameOnWindows("link");

  const progress = screen.getByRole("progressbar", { name: "Setting up" });
  const fill = progress.element().querySelector("[data-fill]");

  await expect.element(progress).toHaveTextContent("2 of 3");
  expect(parseFloat(fill ? getComputedStyle(fill).width : "0")).toBeCloseTo(
    (120 * 2) / 3,
    0,
  );
  expect(getComputedStyle(progress.element()).height).not.toBe("0px");
});

test("sets the actions in a band at the bottom right under a rule", async () => {
  const screen = await renderFrameOnWindows("choices");

  const button = screen.getByRole("button", { name: "Continue" }).element();
  const footer = button.closest("footer");
  const style = footer && getComputedStyle(footer);
  const gutter = parseFloat(style?.paddingRight ?? "0");

  expect(style?.borderTopWidth).toBe("1px");
  expect(button.getBoundingClientRect().right).toBe(
    DESKTOP_WINDOW.width - gutter,
  );
});

test("reserves the room the footer takes so toasts stay clear of Back and Continue", async () => {
  const screen = await renderFrameOnWindows("choices");

  const footer = screen
    .getByRole("button", { name: "Continue" })
    .element()
    .closest("footer");
  const room =
    document.documentElement.style.getPropertyValue("--step-toast-room");

  expect(parseFloat(room)).toBeCloseTo(
    window.innerHeight - (footer?.getBoundingClientRect().top ?? 0),
    0,
  );
});

import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { FirstLaunchStep } from "./steps";
import StepFrame from "./StepFrame.svelte";

const nothing = createRawSnippet(() => ({ render: () => "<span></span>" }));

async function renderFrameOn(step: FirstLaunchStep) {
  const wentBackTo: FirstLaunchStep[] = [];
  const screen = await render(StepFrame, {
    step,
    onBackTo: (earlier: FirstLaunchStep) => {
      wentBackTo.push(earlier);
    },
    children: nothing,
    actions: nothing,
  });
  return { screen, wentBackTo };
}

test("names the current step with its place among the steps", async () => {
  const { screen } = await renderFrameOn("link");

  const current = screen.getByRole("button", {
    name: "Your folders, step 2 of 3",
  });

  await expect.element(current).toHaveAttribute("aria-current", "step");
});

test("lists the numbered steps under the setting up label", async () => {
  const { screen } = await renderFrameOn("link");

  const steps = screen.getByRole("list", { name: "Setting up" });

  expect(steps.getByRole("listitem").elements()).toHaveLength(3);
});

test("keeps the steps ahead from being chosen yet", async () => {
  const { screen, wentBackTo } = await renderFrameOn("link");
  const ahead = screen.getByRole("button", { name: "Choices, step 3 of 3" });

  await ahead.click({ force: true });

  await expect.element(ahead).toHaveAttribute("aria-disabled", "true");
  expect(wentBackTo).toEqual([]);
});

test("goes back to a finished step when it is tapped", async () => {
  const { screen, wentBackTo } = await renderFrameOn("choices");

  await screen
    .getByRole("button", { name: "Home folder, step 1 of 3" })
    .click();

  expect(wentBackTo).toEqual(["home"]);
});

test("stays put when the current step is tapped", async () => {
  const { screen, wentBackTo } = await renderFrameOn("link");

  await screen
    .getByRole("button", { name: "Your folders, step 2 of 3" })
    .click();

  expect(wentBackTo).toEqual([]);
});

test("leaves the way back to the finished steps, with no Back button", async () => {
  const { screen } = await renderFrameOn("choices");

  const back = screen.getByRole("button", { name: "Back" });

  expect(back.elements()).toHaveLength(0);
});

test("shows no steps on the steps around the numbered ones", async () => {
  const { screen } = await renderFrameOn("ready");

  const steps = screen.getByRole("list", { name: "Setting up" });

  expect(steps.elements()).toHaveLength(0);
});

import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { FirstLaunchStep } from "./steps";
import StepFrame from "./StepFrame.svelte";

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

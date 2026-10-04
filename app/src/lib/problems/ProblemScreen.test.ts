import { FileQuestionMark } from "@lucide/svelte";
import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import ProblemScreen from "./ProblemScreen.svelte";

const NEXT_STEP = createRawSnippet(() => ({
  render: () => `<a href="/">Go to Library</a>`,
}));

const PROBLEM = {
  icon: FileQuestionMark,
  title: "This page doesn't exist",
  body: "Nothing in your library has changed.",
  actions: NEXT_STEP,
};

test("names the problem as the page's heading, ready to take focus", async () => {
  const screen = await render(ProblemScreen, PROBLEM);

  const heading = screen.getByRole("heading", {
    level: 1,
    name: "This page doesn't exist",
  });

  await expect.element(heading).toBeVisible();
  await expect.element(heading).toHaveAttribute("tabindex", "-1");
});

test("explains the problem and offers the next step", async () => {
  const screen = await render(ProblemScreen, PROBLEM);

  await expect
    .element(screen.getByText("Nothing in your library has changed."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Go to Library" }))
    .toBeVisible();
});

test("shows the details when there are some", async () => {
  const screen = await render(ProblemScreen, {
    ...PROBLEM,
    detail: "/sample/address",
  });

  await expect.element(screen.getByText("/sample/address")).toBeVisible();
});

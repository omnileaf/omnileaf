import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import CoversChoice from "./CoversChoice.svelte";
import StepFrame from "./StepFrame.svelte";

const action = createRawSnippet(() => ({
  render: () => "<button type='button'>Continue</button>",
}));
const nothing = createRawSnippet(() => ({ render: () => "<span></span>" }));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each(["linux", "macos", "ios", "android"] as const)(
  "keeps the first launch's dots and card layout on %s",
  async (platform) => {
    await page.viewport(1280, 800);
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.theme = "light";
    const screen = await render(StepFrame, {
      step: "link",
      onBack: () => undefined,
      children: nothing,
      actions: action,
    });

    const progress = screen.getByRole("progressbar").element();
    const button = screen.getByRole("button", { name: "Continue" }).element();

    expect(progress.querySelector("[data-fill]")).toBeNull();
    expect(progress.getAttribute("class")).toContain("flex-1");
    expect(button.closest("footer")?.getAttribute("class")).toContain(
      "expanded:flex-row",
    );
  },
);

test("keeps the 18+ covers choice as a heading over a full-width control on Linux", async () => {
  document.documentElement.dataset.platform = "linux";
  const screen = await render(CoversChoice, {
    chosen: "blur",
    onChoose: () => undefined,
  });

  const section = screen.getByRole("region", { name: "18+ covers" }).element();

  expect(section.getAttribute("class")).toBe("flex flex-col gap-sm");
});

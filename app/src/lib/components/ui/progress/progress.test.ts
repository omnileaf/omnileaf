import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Progress from "./progress.svelte";

test("runs a band with no value while the total is unknown", async () => {
  const screen = await render(Progress, {
    value: null,
    "aria-label": "Finding books",
  });

  const bar = screen.getByRole("progressbar", { name: "Finding books" });

  await expect.element(bar).not.toHaveAttribute("aria-valuenow");
  expect(bar.element().firstElementChild).toHaveClass("progress-band");
});

test("fills to the share done once the total is known", async () => {
  const screen = await render(Progress, {
    value: 32,
    max: 100,
    "aria-label": "Finding books",
  });

  const bar = screen.getByRole("progressbar", { name: "Finding books" });

  await expect.element(bar).toHaveAttribute("aria-valuenow", "32");
  await expect.element(bar).toHaveAttribute("aria-valuemax", "100");
  expect(bar.element().firstElementChild).toHaveStyle({ translate: "-68%" });
});

test("shows a full bar when there was nothing to do", async () => {
  const screen = await render(Progress, {
    value: 0,
    max: 0,
    "aria-label": "Finding books",
  });

  const bar = screen.getByRole("progressbar", { name: "Finding books" });

  expect(bar.element().firstElementChild).toHaveStyle({ translate: "0%" });
});

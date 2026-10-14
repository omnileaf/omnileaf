import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Spinner from "./spinner.svelte";

test("names what it waits on in text only a screen reader reads", async () => {
  const screen = await render(Spinner, { size: 20, label: "Loading page 3" });

  const label = screen.getByText("Loading page 3");

  await expect.element(label).toBeInTheDocument();
  await expect.element(label).toHaveClass("sr-only");
});

test("turns an icon kept from screen readers", async () => {
  const screen = await render(Spinner, { size: 20 });

  const icon = screen.getByRole("img", { includeHidden: true });

  await expect.element(icon).toHaveAttribute("aria-hidden", "true");
  await expect.element(icon).toHaveClass("motion-safe:animate-spin");
});

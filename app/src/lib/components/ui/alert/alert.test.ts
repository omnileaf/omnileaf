import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import AlertHarness from "./AlertHarness.svelte";

test("dismisses through a button named for it", async () => {
  const dismissals = { count: 0 };
  const screen = await render(AlertHarness, {
    tone: "plain",
    onDismiss: () => {
      dismissals.count += 1;
    },
  });

  await screen.getByRole("button", { name: "Dismiss" }).click();

  expect(dismissals.count).toBe(1);
});

test("fills its strong action with the strong colour of a warning", async () => {
  const screen = await render(AlertHarness, {
    tone: "warning",
    onDismiss: () => undefined,
  });

  const action = screen.getByRole("button", { name: "Remove its books" });

  await expect.element(action).toHaveClass("bg-on-warning");
  await expect.element(action).toHaveClass("text-warning-soft");
});

test("fills its strong action with the text colour of a plain alert", async () => {
  const screen = await render(AlertHarness, {
    tone: "plain",
    onDismiss: () => undefined,
  });

  const action = screen.getByRole("button", { name: "Remove its books" });

  await expect.element(action).toHaveClass("bg-foreground");
  await expect.element(action).toHaveClass("text-card");
});

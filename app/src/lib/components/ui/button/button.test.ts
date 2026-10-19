import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Button from "./button.svelte";

const label = createRawSnippet(() => ({ render: () => "<span>Cancel</span>" }));

test("renders the confirm dialog cancel look on a native button", async () => {
  const screen = await render(Button, {
    look: "confirm-cancel",
    type: "button",
    children: label,
  });

  const button = screen.getByRole("button", { name: "Cancel" });

  await expect.element(button).toBeVisible();
  await expect.element(button).toHaveClass(/rounded-full/);
  await expect.element(button).toHaveClass(/medium:rounded-dialog-button/);
});

test("shows it is busy until the work it waits on settles", async () => {
  const work = Promise.withResolvers<undefined>();
  const screen = await render(Button, {
    look: "dialog-primary",
    type: "button",
    children: label,
    onClickPromise: () => work.promise,
  });
  const button = screen.getByRole("button", { name: "Cancel" });

  await button.click();

  await expect.element(button).toHaveAttribute("aria-busy", "true");
  await expect.element(button).toHaveAttribute("aria-disabled", "true");
  work.resolve(undefined);
  await expect.element(button).not.toHaveAttribute("aria-busy");
  await expect.element(button).not.toHaveAttribute("aria-disabled");
});

test("starts the work only once while it is busy", async () => {
  const work = Promise.withResolvers<undefined>();
  const starts = { count: 0 };
  const screen = await render(Button, {
    look: "dialog-primary",
    type: "button",
    children: label,
    onClickPromise: () => {
      starts.count += 1;
      return work.promise;
    },
  });
  const button = screen.getByRole("button", { name: "Cancel" });
  await button.click();

  button.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(starts.count).toBe(1);
});

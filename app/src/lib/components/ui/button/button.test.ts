import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Button from "./button.svelte";

const label = createRawSnippet(() => ({ render: () => "Cancel" }));

test("renders the confirm dialog cancel look on a native button", async () => {
  const screen = await render(Button, {
    look: "confirm-cancel",
    type: "button",
    children: label,
  });

  const button = screen.getByRole("button", { name: "Cancel" });

  await expect.element(button).toBeVisible();
  await expect.element(button).toHaveClass(/rounded-full/);
  await expect.element(button).toHaveClass(/medium:rounded-button/);
});

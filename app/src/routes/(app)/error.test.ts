import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import ErrorPage from "./+error.svelte";

const ADDRESS = "/sample/address";

const problem = vi.hoisted(() => ({
  status: 404,
  url: new URL("http://localhost/sample/address"),
}));

vi.mock("$app/state", () => ({ page: problem }));

test("explains that the address leads nowhere and shows it", async () => {
  problem.status = 404;

  const screen = await render(ErrorPage);

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "This page doesn't exist",
      }),
    )
    .toBeVisible();
  await expect.element(screen.getByText(ADDRESS)).toBeVisible();
});

test("explains that the page couldn't be opened, without blaming the address", async () => {
  problem.status = 500;

  const screen = await render(ErrorPage);

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "This page couldn't be opened",
      }),
    )
    .toBeVisible();
  await expect.element(screen.getByText(ADDRESS)).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Go to Library" }))
    .toBeVisible();
});

import { Compass } from "@lucide/svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import EmptyState from "./EmptyState.svelte";

const TITLE = "Nothing here yet";
const BODY = "Things you add show up here.";

test("names the empty state after its title and explains it", async () => {
  const screen = await render(EmptyState, {
    icon: Compass,
    title: TITLE,
    body: BODY,
  });

  const region = screen.getByRole("region", { name: TITLE });

  await expect
    .element(region.getByRole("heading", { level: 2, name: TITLE }))
    .toBeVisible();
  await expect.element(region.getByText(BODY)).toBeVisible();
});

test("draws its icon as decoration only", async () => {
  const screen = await render(EmptyState, {
    icon: Compass,
    title: TITLE,
    body: BODY,
  });

  const region = screen.getByRole("region", { name: TITLE });

  await expect.element(region.getByRole("img")).not.toBeInTheDocument();
});

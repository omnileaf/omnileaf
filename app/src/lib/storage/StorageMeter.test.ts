import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import StorageMeter from "./StorageMeter.svelte";

const USED = {
  omnileafBytes: 1_440_000_000,
  cachedPagesBytes: 1_200_000_000,
  coversBytes: 210_000_000,
  freeBytes: 1_100_000_000,
  totalBytes: 128_000_000_000,
  isLow: true,
};

test("measures the space used as a meter that says how much is free", async () => {
  const screen = await render(StorageMeter, { used: USED });

  const meter = screen.getByRole("meter", { name: "Space used" });

  await expect.element(meter).toHaveAttribute("aria-valuenow", "99");
  await expect
    .element(meter)
    .toHaveAttribute("aria-valuetext", "1.1 GB free of 128 GB");
});

test("names Omnileaf's share, everything else and what's free", async () => {
  const screen = await render(StorageMeter, { used: USED });

  await expect.element(screen.getByText("Omnileaf 1.4 GB")).toBeVisible();
  await expect.element(screen.getByText("Everything else")).toBeVisible();
  await expect.element(screen.getByText("1.1 GB free")).toBeVisible();
});

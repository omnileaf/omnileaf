import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import StorageMeter from "./StorageMeter.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

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

test("splits the Android bar into three parts 4px apart, and sets the legend in muted type", async () => {
  followCorePlatform("android");
  const screen = await render(StorageMeter, { used: USED });

  const meter = screen.getByRole("meter").element();
  const [first, second, third] = [...meter.children];
  const legend = screen.getByText("Everything else").element();

  expect(meter.children).toHaveLength(3);
  expect(
    (second?.getBoundingClientRect().left ?? 0) -
      (first?.getBoundingClientRect().right ?? 0),
  ).toBeCloseTo(4, 0);
  expect(
    (third?.getBoundingClientRect().left ?? 0) -
      (second?.getBoundingClientRect().right ?? 0),
  ).toBeCloseTo(4, 0);
  expect(getComputedStyle(legend).color).toBe(
    getComputedStyle(screen.getByText("1.1 GB free").element()).color,
  );
});

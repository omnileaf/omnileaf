import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import StorageMeter from "./StorageMeter.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

function childOf(parent: Element, index: number): Element {
  const child = parent.children[index];
  if (child === undefined) {
    throw new Error(`the meter drew no part ${String(index)}`);
  }
  return child;
}

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

test("draws the Android bar 8 thick with Everything else in the muted ink", async () => {
  followCorePlatform("android");
  const screen = await render(StorageMeter, { used: USED });

  const meter = screen.getByRole("meter").element();

  expect(meter.getBoundingClientRect().height).toBeCloseTo(8, 0);
  expect(getComputedStyle(childOf(meter, 1)).backgroundColor).toBe(
    "rgb(88, 97, 90)",
  );
});

test("marks each Android legend entry with an 8 round dot in its part's colour", async () => {
  followCorePlatform("android");
  const screen = await render(StorageMeter, { used: USED });

  const meter = screen.getByRole("meter").element();
  const dots = [
    screen.getByText("Omnileaf 1.4 GB").element(),
    screen.getByText("Everything else").element(),
    screen.getByText("1.1 GB free").element(),
  ].map((entry) => {
    const dot = entry.querySelector("[aria-hidden]");
    if (dot === null) {
      throw new Error("a legend entry drew no dot");
    }
    return dot;
  });

  expect(dots[0]?.getBoundingClientRect().width).toBeCloseTo(8, 0);
  for (const [index, dot] of dots.entries()) {
    expect(getComputedStyle(dot).backgroundColor).toBe(
      getComputedStyle(childOf(meter, index)).backgroundColor,
    );
  }
});

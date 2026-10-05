import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { LicensedPackage } from "./licences";
import LicenceGroupList from "./LicenceGroupList.svelte";

function packages(count: number): LicensedPackage[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `rust/sample-${String(index)}@1.0.${String(index)}`,
    name: `sample-${String(index)}`,
    version: `1.0.${String(index)}`,
    licence: "MIT",
    texts: [],
  }));
}

async function renderGroup(count: number) {
  return render(LicenceGroupList, {
    group: { name: "MIT", packages: packages(count) },
    look: "pane",
  });
}

test("names the licence and counts its packages", async () => {
  const screen = await renderGroup(5);

  await expect
    .element(screen.getByRole("heading", { level: 2, name: "MIT" }))
    .toBeVisible();
  await expect.element(screen.getByText("5 packages")).toBeVisible();
});

test("links each package to its licence", async () => {
  const screen = await renderGroup(1);

  await expect
    .element(screen.getByRole("link", { name: "sample-0 1.0.0" }))
    .toHaveAttribute("href", "/settings/about/licences/rust/sample-0@1.0.0");
});

test("shows the first three packages and offers the rest", async () => {
  const screen = await renderGroup(5);

  await expect.element(screen.getByRole("link").nth(2)).toBeVisible();
  expect(screen.getByRole("link").elements()).toHaveLength(3);
  await expect
    .element(screen.getByRole("button", { name: "Show all 5" }))
    .toBeVisible();
});

test("lists every package once asked, focusing the first it revealed", async () => {
  const screen = await renderGroup(5);

  await screen.getByRole("button", { name: "Show all 5" }).click();

  await expect
    .element(screen.getByRole("link", { name: "sample-3 1.0.3" }))
    .toHaveFocus();
  expect(screen.getByRole("link").elements()).toHaveLength(5);
  expect(screen.getByRole("button").elements()).toHaveLength(0);
});

test("lists a short group whole", async () => {
  const screen = await renderGroup(3);

  await expect.element(screen.getByRole("link").nth(2)).toBeVisible();
  expect(screen.getByRole("button").elements()).toHaveLength(0);
});

import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesNotConnectedCard from "./SeriesNotConnectedCard.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

async function cardHearing(heard: string[]) {
  await page.viewport(400, 800);
  followCorePlatform("android");
  return render(SeriesNotConnectedCard, {
    title: "Sample Series 04",
    onFind: () => heard.push("find"),
    onCheckAgain: () => heard.push("check again"),
  });
}

test("says the series isn't connected and that its progress is safe", async () => {
  const screen = await cardHearing([]);

  const card = screen.getByRole("status");

  await expect
    .element(card.getByText("Sample Series 04 isn’t connected"))
    .toBeVisible();
  expect(card.element().textContent).toContain(
    "Its folder or drive may be disconnected. You can still change its reading state and tags. Your reading progress is safe.",
  );
});

test("finds the folder and checks again from its two actions", async () => {
  const heard: string[] = [];
  const screen = await cardHearing(heard);

  await screen.getByRole("button", { name: "Find the folder" }).click();
  await screen.getByRole("button", { name: "Check again" }).click();

  expect(heard).toEqual(["find", "check again"]);
});

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
    title: "Sample Series 04 isn’t connected",
    body: "Its folder or drive may be disconnected. You can still change its reading state and tags. Your reading progress is safe.",
    onFind: () => heard.push("find"),
    onCheckAgain: () => heard.push("check again"),
  });
}

test("says what isn't connected and why", async () => {
  const screen = await cardHearing([]);

  const card = screen
    .getByText("Sample Series 04 isn’t connected")
    .element()
    .closest('[data-slot="alert"]');

  expect(card?.textContent).toContain(
    "Its folder or drive may be disconnected. You can still change its reading state and tags. Your reading progress is safe.",
  );
});

test("stays out of a live region, so a body that changes as books load is not read out", async () => {
  const screen = await cardHearing([]);

  expect(
    screen.container.querySelectorAll('[role="status"], [aria-live]'),
  ).toHaveLength(0);
});

test("finds the folder and checks again from its two actions", async () => {
  const heard: string[] = [];
  const screen = await cardHearing(heard);

  await screen.getByRole("button", { name: "Find the folder" }).click();
  await screen.getByRole("button", { name: "Check again" }).click();

  expect(heard).toEqual(["find", "check again"]);
});

test("offers only Find the folder without a way to check again", async () => {
  await page.viewport(400, 800);
  followCorePlatform("android");
  const screen = await render(SeriesNotConnectedCard, {
    title: "2 of 8 books aren’t connected",
    body: "Volumes 7 and 8 are on a drive that is not there.",
    onFind: () => undefined,
  });

  expect(
    screen
      .getByRole("button")
      .elements()
      .map((button) => button.textContent.trim()),
  ).toEqual(["Find the folder"]);
});

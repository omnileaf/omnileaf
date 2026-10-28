import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import HomeCard from "./HomeCard.svelte";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const LOCATION = "C:\\Users\\Reader\\Documents\\Omnileaf";
const TERM_WIDTH = 140;

const change = createRawSnippet(() => ({
  render: () => "<button type='button'>Change</button>",
}));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

async function renderHomeOnWindows() {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  return render(HomeCard, {
    title: "Home folder",
    location: LOCATION,
    facts: [
      { term: "Keeps", detail: "Progress, categories and backups" },
      { term: "Your comics", detail: "Stay where they are" },
    ],
    change,
  });
}

test("sets the home folder on a card of its own with Change at its end", async () => {
  const screen = await renderHomeOnWindows();

  const region = screen.getByRole("region", { name: "Home folder" }).element();
  const card = region.firstElementChild;
  const button = screen.getByRole("button", { name: "Change" }).element();

  expect(card?.contains(button)).toBe(true);
  expect(card?.textContent).toContain(LOCATION);
  expect(card && getComputedStyle(card).borderTopWidth).toBe("1px");
  expect(screen.getByText(LOCATION).element().closest("code")).toBeNull();
});

test("keeps what the home folder holds on a second card, terms in a 140px column", async () => {
  const screen = await renderHomeOnWindows();

  const term = screen.getByText("Keeps", { exact: true }).element();
  const detail = screen.getByText("Progress, categories and backups").element();
  const facts = term.closest("dl");

  expect(facts && getComputedStyle(facts).borderTopWidth).toBe("1px");
  expect(
    detail.getBoundingClientRect().left - term.getBoundingClientRect().left,
  ).toBeGreaterThanOrEqual(TERM_WIDTH);
});

import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import HomeCard from "./HomeCard.svelte";

const PHONE = { width: 400, height: 800 } as const;
const ICON_SIZE = 24;

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

async function renderHomeOnAndroid() {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform("android");
  return render(HomeCard, {
    title: "Home folder",
    location: "Internal storage",
    facts: [{ term: "Keeps", detail: "Progress, categories and backups" }],
  });
}

test("draws the home folder with a 24px Material folder and the row title type", async () => {
  const screen = await renderHomeOnAndroid();

  const icon = screen.container.querySelector('[data-icon="folder"]');
  const title = screen.getByText("Home folder").element();
  const style = getComputedStyle(title);
  const term = getComputedStyle(screen.getByText("Keeps").element());

  expect(icon?.getBoundingClientRect().width).toBe(ICON_SIZE);
  expect(style.letterSpacing).toBe("0.5px");
  expect(style.fontSize).toBe("16px");
  expect(style.lineHeight).toBe("24px");
  expect(term.letterSpacing).toBe("0.5px");
});

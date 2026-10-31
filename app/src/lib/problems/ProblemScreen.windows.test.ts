import { FileQuestionMark } from "@lucide/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio";

import ProblemScreen from "./ProblemScreen.svelte";

const NEXT_STEP = createRawSnippet(() => ({
  render: () => `<a href="/">Go to Library</a>`,
}));

const PROBLEM = {
  icon: FileQuestionMark,
  title: "This page doesn't exist",
  body: "Nothing in your library has changed.",
  detail: "/sample/address",
  actions: NEXT_STEP,
};

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function problemOn(
  platform: "windows" | "macos",
  theme: "light" | "dark" = "light",
) {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  const screen = await render(ProblemScreen, PROBLEM);
  return {
    title: screen.getByRole("heading", { level: 1 }).element(),
    body: screen.getByText(PROBLEM.body).element(),
    detail: screen.getByText(PROBLEM.detail).element(),
  };
}

function metricsOf(element: Element): readonly string[] {
  const style = getComputedStyle(element);
  return [style.fontSize, style.lineHeight, style.fontWeight];
}

function inkOnThePage(element: Element): number {
  const probe = document.createElement("div");
  probe.style.backgroundColor = "var(--background)";
  probe.style.color = getComputedStyle(element).color;
  document.body.append(probe);
  return drawnContrast(probe);
}

test("sets the title as a 20 over 28 semibold Subtitle and the body as a 14 over 20 Body on Windows", async () => {
  const { title, body } = await problemOn("windows");

  expect(metricsOf(title)).toEqual(["20px", "28px", "600"]);
  expect(metricsOf(body)).toEqual(["14px", "20px", "400"]);
});

test("draws the icon bare beside the title with no round badge on Windows", async () => {
  const { title } = await problemOn("windows");

  const icon = title.previousElementSibling;

  expect(icon?.querySelector("svg")).not.toBeNull();
  expect(getComputedStyle(icon ?? title).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("rounds the details to a Windows control's corner", async () => {
  const { detail } = await problemOn("windows");

  expect(getComputedStyle(detail).borderTopLeftRadius).toBe("4px");
});

for (const theme of ["light", "dark"] as const) {
  test(`reads the title, body and details at 4.5 to 1 on Windows in the ${theme} theme`, async () => {
    const { title, body, detail } = await problemOn("windows", theme);

    expect(inkOnThePage(title)).toBeGreaterThanOrEqual(4.5);
    expect(inkOnThePage(body)).toBeGreaterThanOrEqual(4.5);
    expect(drawnContrast(detail)).toBeGreaterThanOrEqual(4.5);
  });
}

test("keeps the 24px title and muted body on macOS", async () => {
  const { title, body } = await problemOn("macos");

  expect(metricsOf(title)[0]).toBe("24px");
  expect(metricsOf(body)[2]).not.toBe("600");
  expect(getComputedStyle(title).fontWeight).toBe("700");
});

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import ThemeChoice from "./ThemeChoiceHarness.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("sets the Android settings choice flush under a 44px accent heading, with no card", async () => {
  followCorePlatform("android");
  const screen = await render(ThemeChoice, { title: "Light or dark" });

  const heading = screen
    .getByRole("heading", { name: "Light or dark" })
    .element();
  const section = heading.closest("section");
  const group = screen.getByRole("radiogroup").element();

  expect(section ? getComputedStyle(section).borderTopWidth : "").toBe("0px");
  expect(heading.getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(getComputedStyle(heading).fontSize).toBe("14px");
  expect(getComputedStyle(heading).fontWeight).toBe("500");
  expect(group.getBoundingClientRect().left).toBeCloseTo(
    (section?.getBoundingClientRect().left ?? 0) + 16,
    0,
  );
});

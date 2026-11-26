import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SettingChoiceRow from "./SettingChoiceRow.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const PROPS = {
  title: "The library opens on",
  value: "The tab used last",
  help: "Or All, or a tab you choose.",
  choices: [
    { value: "last", label: "The tab used last" },
    {
      value: "all",
      label: "All",
      hint: "Every series in your library.",
    },
  ],
  chosen: "last",
  onChoose: () => undefined,
};

test("sets the title, the value and the help as three lines, the title at 16px with 0.5px tracking", async () => {
  followCorePlatform("android");
  const screen = await render(SettingChoiceRow, PROPS);

  const row = screen.getByRole("button").element();
  const title = screen.getByText(PROPS.title).element();
  const help = screen.getByText(PROPS.help).element();

  expect(getComputedStyle(title).letterSpacing).toBe("0.5px");
  expect(getComputedStyle(title).fontSize).toBe("16px");
  expect(getComputedStyle(help).fontSize).toBe("14px");
  expect(help.getBoundingClientRect().top).toBeGreaterThan(
    screen.getByText(PROPS.value).element().getBoundingClientRect().bottom - 1,
  );
  expect(row.getBoundingClientRect().height).toBeGreaterThan(72);
});

test("leaves out the help line when none is given", async () => {
  followCorePlatform("android");
  const screen = await render(SettingChoiceRow, { ...PROPS, help: undefined });

  expect(screen.getByText(PROPS.help).elements()).toEqual([]);
});

test("reads a choice's hint out as the description of its radio", async () => {
  followCorePlatform("android");
  const screen = await render(SettingChoiceRow, PROPS);

  await screen.getByRole("button").click();

  await expect
    .element(screen.getByRole("radio", { name: "All" }))
    .toHaveAccessibleDescription("Every series in your library.");
});

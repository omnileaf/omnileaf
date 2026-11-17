import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SettingChoiceRow from "./SettingChoiceRow.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const PROPS = {
  title: "Reading mode for new series",
  value: "Automatic",
  help: "Automatic picks paged or long strip.",
  choices: [
    { value: "automatic", label: "Automatic" },
    { value: "longStrip", label: "Long strip" },
  ],
  chosen: "automatic",
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
    screen.getByText("Automatic").element().getBoundingClientRect().bottom - 1,
  );
  expect(row.getBoundingClientRect().height).toBeGreaterThan(72);
});

test("leaves out the help line when none is given", async () => {
  followCorePlatform("android");
  const screen = await render(SettingChoiceRow, { ...PROPS, help: undefined });

  expect(screen.getByText(PROPS.help).elements()).toEqual([]);
});

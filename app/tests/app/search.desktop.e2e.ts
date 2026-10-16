import { expect, test } from "vitest";

import { addSampleLibrary, useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const SERIES_FOUND = xpath("//ul[@aria-label='Series found']/li");
const QUICK_OPEN_SERIES = xpath(
  "//*[@aria-modal='true'][@data-state='open']//*[@role='group'][@aria-labelledby=//*[normalize-space()='Series and books']/@id]//*[@role='option']",
);

/** Types into the library header's search field the way a keystroke would, since the driver has no keyboard. */
const TYPE_IN_LIBRARY_SEARCH = `const field = document.querySelector("main header input[type='search']");
if (field === null) return false;
field.value = "series 02";
field.dispatchEvent(new Event("input", { bubbles: true }));
return true;`;

const OPEN_QUICK_OPEN_AND_TYPE = `const field = document.querySelector("[aria-modal=true][data-state=open] input[role='combobox']");
if (field === null) {
  const modifier = document.documentElement.dataset.platform === "macos" ? { metaKey: true } : { ctrlKey: true };
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ...modifier }));
  return false;
}
field.value = "sample";
field.dispatchEvent(new Event("input", { bubbles: true }));
return true;`;

const appSession = useAppSession();

test("finds a series of the folder added by a word of its title", async () => {
  await addSampleLibrary(appSession());

  await appSession().waitUntil(TYPE_IN_LIBRARY_SEARCH, "the search field");

  const found = await appSession().waitFor(SERIES_FOUND);
  expect(await found.text()).toMatch(/^Sample Series 02/);
});

test("offers the series of the folder added in quick open", async () => {
  await addSampleLibrary(appSession());

  await appSession().waitUntil(OPEN_QUICK_OPEN_AND_TYPE, "quick open's field");

  const first = await appSession().waitFor(QUICK_OPEN_SERIES);
  expect(await first.text()).toMatch(/^Sample Series 01/);
});

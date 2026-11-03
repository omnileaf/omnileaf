import { expect, test } from "vitest";

import { addSampleLibrary, useAppSession } from "./app-session.ts";

const SERIES_LINKS = "ul[aria-label='Series'] a[data-pickable-link]";
const SERIES_BOXES =
  "ul[aria-label='Series'] [role=checkbox][data-pickable-link]";
const SELECTED_BAR = "[role=group][aria-label='Selected series']";
const DIALOG = "[role=dialog]";

const appSession = useAppSession();

const buttonNamed = (scope: string, name: string): string =>
  `[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((button) => (button.getAttribute("aria-label") ?? button.textContent).trim() === ${JSON.stringify(name)})`;

const PICKED_BOXES = SERIES_BOXES;

const startPicking = `const link = document.querySelectorAll(${JSON.stringify(SERIES_LINKS)})[0];
if (link === undefined) return false;
link.focus();
link.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
return true;`;

const pickSecond = `const box = document.querySelectorAll(${JSON.stringify(PICKED_BOXES)})[1];
if (box === undefined) return false;
box.click();
return true;`;

const BOXES_SHOWN = `return document.querySelectorAll(${JSON.stringify(PICKED_BOXES)}).length > 1;`;

async function pickFirstTwo(): Promise<void> {
  await appSession().waitUntil(startPicking, "the first series picked");
  await appSession().waitUntil(BOXES_SHOWN, "the series as checkboxes");
  await appSession().run(pickSecond);
}

const CATEGORIES_BUTTON_SHOWN = `return ${buttonNamed(SELECTED_BAR, "Categories")} !== undefined;`;

const press = (
  scope: string,
  name: string,
): string => `const button = ${buttonNamed(scope, name)};
if (button === undefined) return false;
button.click();
return true;`;

const typeInto = (
  label: string,
  text: string,
): string => `const field = document.querySelector(${JSON.stringify(`${DIALOG} input[aria-label=${JSON.stringify(label)}]`)});
if (field === null) return false;
field.value = ${JSON.stringify(text)};
field.dispatchEvent(new Event("input", { bubbles: true }));
field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
return true;`;

const holdsLabel = (name: string): string =>
  `return document.querySelector(${JSON.stringify(`${DIALOG} [aria-label=${JSON.stringify(name)}]`)}) !== null;`;

const categoryTicked = (
  name: string,
): string => `const box = document.querySelector(${JSON.stringify(`${DIALOG} [role=checkbox][aria-label=${JSON.stringify(name)}]`)});
return box !== null && box.getAttribute("aria-checked") === "true";`;

const DIALOG_GONE = `return document.querySelector(${JSON.stringify(DIALOG)}) === null;`;

async function openLabels(from: "Categories" | "Tags"): Promise<void> {
  await appSession().waitUntil(press(SELECTED_BAR, from), `the ${from} button`);
  await appSession().waitUntil(
    `return document.querySelector(${JSON.stringify(`${DIALOG} input`)}) !== null;`,
    "the labels dialog",
  );
}

async function finishDialog(): Promise<void> {
  await appSession().waitUntil(press(DIALOG, "Done"), "the Done button");
  await appSession().waitUntil(DIALOG_GONE, "the dialog closed");
}

test("keeps a category and a tag on every series they were applied to together", async () => {
  await addSampleLibrary(appSession());
  await pickFirstTwo();
  await appSession().waitUntil(CATEGORIES_BUTTON_SHOWN, "two series picked");

  await openLabels("Categories");
  await appSession().waitUntil(
    typeInto("New category", "Holiday"),
    "the new category field",
  );
  await appSession().waitUntil(categoryTicked("Holiday"), "Holiday ticked");
  await finishDialog();
  await openLabels("Tags");
  await appSession().waitUntil(
    typeInto("Add a tag", "Winter"),
    "the tag field",
  );
  await appSession().waitUntil(holdsLabel("Remove Winter"), "Winter added");
  await finishDialog();

  await appSession().reload();
  await appSession().waitUntil(
    `return document.querySelector(${JSON.stringify(SERIES_LINKS)}) !== null;`,
    "the library again",
  );
  await pickFirstTwo();
  await appSession().waitUntil(CATEGORIES_BUTTON_SHOWN, "the same two picked");
  await openLabels("Categories");
  await appSession().waitUntil(categoryTicked("Holiday"), "Holiday kept");
  await finishDialog();
  await openLabels("Tags");
  await appSession().waitUntil(holdsLabel("Remove Winter"), "Winter kept");
  expect(await appSession().run(holdsLabel("Remove Winter"))).toBe(true);
});

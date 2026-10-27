import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { isRecord } from "./json.ts";
import { ELEMENT_TIMEOUT_MS, xpath } from "./webdriver.ts";

const LIBRARY_MORE = `document.querySelector("button[aria-label='More for the library']")`;
const VIEW_OPTIONS_ITEM = `[...document.querySelectorAll("[role=menuitem]")].find((item) => item.textContent.trim() === "View options")`;
const OPEN_SHEET = xpath(
  "//*[@aria-modal='true'][@data-state='open']//h2[normalize-space()='View options']",
);
const CHOOSE_COVERS = xpath(
  "//*[@aria-modal='true'][@data-state='open']//*[@role='radio'][.//span[normalize-space()='Choose']]",
);
const DONE = xpath(
  "//*[@aria-modal='true'][@data-state='open']//button[normalize-space()='Done']",
);
const FEWER = "Fewer covers per row";
const MORE = "More covers per row";
const SHEET_CONTENT_HEIGHT = `return document.querySelector("[aria-modal=true][data-state=open]").scrollHeight;`;
const COVERS_PER_ROW = `document.querySelector("[aria-modal=true][data-state=open] output").textContent.trim()`;
const CAN_SHOW_FEWER = `return !document.querySelector("[aria-modal=true][data-state=open] button[aria-label='${FEWER}']").disabled;`;

const appSession = useAppSession();

function tappableCentreOf(element: string): string {
  return `const element = ${element};
if (!element) {
  return null;
}
const { x, y, width, height } = element.getBoundingClientRect();
const centre = { x: x + width / 2, y: y + height / 2 };
return element.contains(document.elementFromPoint(centre.x, centre.y)) ? centre : null;`;
}

/** Taps with a finger on the screen, since More opens its menu only on a touch pointerup that a WebDriver click never sends, and Appium's XCUITest driver polls for alerts throughout any click in the web view that runs past 2.1 s. */
async function tapWithFinger(element: string, name: string): Promise<void> {
  const script = tappableCentreOf(element);
  const centre = await appSession().pollOnPage(
    async () => {
      const found = await appSession().run(script);
      return isRecord(found) ? found : undefined;
    },
    ELEMENT_TIMEOUT_MS,
    name,
  );
  await appSession().runMobileCommand("tap", centre);
}

async function stepCoversPerRow(label: string): Promise<void> {
  const before = await appSession().run(`return ${COVERS_PER_ROW};`);
  const step = xpath(
    `//*[@aria-modal='true'][@data-state='open']//button[@aria-label='${label}'][not(@disabled)]`,
  );

  await (await appSession().waitFor(step)).click();

  await appSession().waitUntil(
    `return ${COVERS_PER_ROW} !== ${JSON.stringify(before)};`,
    `covers per row to change from ${String(before)}`,
  );
}

test("opens View options at the height it keeps once something in it changes", async () => {
  await tapWithFinger(LIBRARY_MORE, "More for the library");
  await tapWithFinger(VIEW_OPTIONS_ITEM, "View options in More");
  await appSession().waitFor(OPEN_SHEET);
  await (await appSession().waitFor(CHOOSE_COVERS)).click();
  await appSession().waitUntil(
    `return document.querySelector("[aria-modal=true][data-state=open] button[aria-label='${FEWER}']") !== null;`,
    "the covers per row steppers",
  );
  const opened = await appSession().run(SHEET_CONTENT_HEIGHT);
  const [away, back] =
    (await appSession().run(CAN_SHOW_FEWER)) === true
      ? [FEWER, MORE]
      : [MORE, FEWER];

  await stepCoversPerRow(away);
  await stepCoversPerRow(back);

  expect(await appSession().run(SHEET_CONTENT_HEIGHT)).toBe(opened);
  await (await appSession().waitFor(DONE)).click();
});

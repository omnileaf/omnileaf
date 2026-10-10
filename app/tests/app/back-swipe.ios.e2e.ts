import { expect, test } from "vitest";

import { mainNavigationLink, useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const EDGE_X = 0;
const SWIPE_Y = 420;
const RELEASE_X = 320;
const NO_PAUSE_SECONDS = 0;
const FINGER_POINTS_PER_SECOND = 600;

const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath(
  "//main//a[starts-with(normalize-space(), 'Library')]",
);

function pageHeading(title: string) {
  return xpath(`//main//h1[normalize-space()='${title}']`);
}

const appSession = useAppSession();

test("goes back from Settings › Library to Settings on a swipe from the left edge", async () => {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
  await appSession().waitFor(pageHeading("Library"));

  await appSession().runMobileCommand("dragFromToWithVelocity", {
    pressDuration: NO_PAUSE_SECONDS,
    holdDuration: NO_PAUSE_SECONDS,
    velocity: FINGER_POINTS_PER_SECOND,
    fromX: EDGE_X,
    fromY: SWIPE_Y,
    toX: RELEASE_X,
    toY: SWIPE_Y,
  });

  const heading = await appSession().waitFor(pageHeading("Settings"));
  expect(await heading.text()).toBe("Settings");
});

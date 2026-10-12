import { mainNavigationLink, openLibraryPage } from "./app-session.ts";
import { type Locator, type Session, xpath } from "./webdriver.ts";

const SCHEDULED_CHECKS_LABEL =
  "Check folders for new books while Omnileaf is open";
const SCHEDULED_CHECKS_SWITCH = `//main//button[@role='switch'][.//*[normalize-space()="${SCHEDULED_CHECKS_LABEL}"]]`;
const ADVANCED_SETTINGS_ROW = xpath(
  "//main//a[starts-with(normalize-space(), 'Advanced')]",
);
const SETTINGS_LINK = mainNavigationLink("Settings");
const SETTINGS_LINK_WHEN_CURRENT = xpath(
  `${SETTINGS_LINK.value}[@aria-current='page']`,
);

function scheduledChecksSwitch(isOn: boolean): Locator {
  return xpath(`${SCHEDULED_CHECKS_SWITCH}[@aria-checked='${String(isOn)}']`);
}

async function isScheduledChecksSwitchOn(session: Session): Promise<boolean> {
  await session.waitFor(xpath(SCHEDULED_CHECKS_SWITCH));
  const isOn = await session.run(
    `return document.evaluate(${JSON.stringify(`boolean(${SCHEDULED_CHECKS_SWITCH}[@aria-checked='true'])`)}, document, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;`,
  );
  return isOn === true;
}

export async function turnScheduledChecks(
  session: Session,
  isOn: boolean,
): Promise<void> {
  await (await session.waitFor(SETTINGS_LINK)).click();
  await session.waitFor(SETTINGS_LINK_WHEN_CURRENT);
  await (await session.waitFor(ADVANCED_SETTINGS_ROW)).click();
  if ((await isScheduledChecksSwitchOn(session)) !== isOn) {
    await (await session.waitFor(xpath(SCHEDULED_CHECKS_SWITCH))).click();
  }
  await session.waitFor(scheduledChecksSwitch(isOn));
  await openLibraryPage(session);
}

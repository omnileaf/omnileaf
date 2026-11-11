import { type Session, xpath } from "./webdriver.ts";

/** The Files picker runs in its own process, which a CI Simulator can take most of a minute to start the first time a picker is shown. */
export const PICKER_APPEARS_TIMEOUT_MS = 60_000;
export const PICKER_TIMEOUT_MS = 20_000;
export const LEFT_OPEN_TIMEOUT_MS = 1_000;

export const RECENT_TAB = xpath(
  "//XCUIElementTypeButton[@name='Recent' or @name='Recents']",
);
const CANCEL_BUTTON = xpath("//XCUIElementTypeButton[@name='Cancel']");

export async function cancelPicker(session: Session): Promise<void> {
  await session.inNativeContext(async () => {
    await (await session.waitFor(RECENT_TAB, PICKER_TIMEOUT_MS)).click();
    await (await session.waitFor(CANCEL_BUTTON, PICKER_TIMEOUT_MS)).click();
  });
}

interface FinishedTest {
  readonly result?: { readonly state?: string } | undefined;
}

export async function closeAnyPicker(
  session: Session,
  timeoutMs: number,
): Promise<void> {
  await session.inNativeContext(async () => {
    const recentTab = await session.findWithin(RECENT_TAB, timeoutMs);
    if (recentTab === undefined) {
      return;
    }
    await recentTab.click();
    await (await session.waitFor(CANCEL_BUTTON, PICKER_TIMEOUT_MS)).click();
  });
}

export async function closePickerLeftBy(
  session: Session,
  test: FinishedTest,
): Promise<void> {
  await closeAnyPicker(
    session,
    test.result?.state === "fail"
      ? PICKER_APPEARS_TIMEOUT_MS
      : LEFT_OPEN_TIMEOUT_MS,
  );
}

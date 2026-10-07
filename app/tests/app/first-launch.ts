import { type Session, xpath } from "./webdriver.ts";

const WELCOME_OR_LIBRARY = xpath(
  "//h1[normalize-space()='Welcome to Omnileaf'] | //nav//a[normalize-space()='Library']",
);
const GET_STARTED = xpath("//button[normalize-space()='Get started']");

const STEPS = [
  { heading: "Where your library lives", leaveWith: "Continue" },
  { heading: "Already have comics or books?", leaveWith: "Continue" },
  { heading: "A few choices", leaveWith: "Continue" },
  { heading: "You're all set", leaveWith: "Open my library" },
] as const;

/** Goes through every step of the first launch when the app opens on it, as it does until one session has finished it. */
export async function finishFirstLaunchIfShown(
  session: Session,
): Promise<void> {
  const opened = await session.waitFor(WELCOME_OR_LIBRARY);
  if ((await opened.text()) !== "Welcome to Omnileaf") {
    return;
  }
  await (await session.waitFor(GET_STARTED)).click();
  for (const step of STEPS) {
    await session.waitFor(xpath(`//h1[normalize-space()="${step.heading}"]`));
    const leave = xpath(
      `//main//button[normalize-space()="${step.leaveWith}"]`,
    );
    await (await session.waitFor(leave)).click();
  }
}

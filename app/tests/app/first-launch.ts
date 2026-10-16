import { type Locator, type Session, xpath } from "./webdriver.ts";

const WELCOME_OR_LIBRARY = xpath(
  "//h1[normalize-space()='Welcome to Omnileaf'] | //nav//a[normalize-space()='Library']",
);
const GET_STARTED = xpath("//button[normalize-space()='Get started']");

const STEPS = [
  {
    headings: [
      "Where your library lives",
      "Your backups and books are in Files",
    ],
    leaveWith: "Continue",
  },
  { headings: ["Already have comics or books?"], leaveWith: "Skip" },
  { headings: ["A few choices"], leaveWith: "Continue" },
  {
    headings: [
      "You're all set",
      "Your library is empty for now",
      "Found *",
    ],
    leaveWith: "Open my library",
  },
] as const;

function headingNamed(names: readonly string[]): Locator {
  const anyName = names
    .map((name) =>
      name.endsWith("*")
        ? `starts-with(normalize-space(), "${name.slice(0, -1)}")`
        : `normalize-space()="${name}"`,
    )
    .join(" or ");
  return xpath(`//h1[${anyName}]`);
}

export async function finishFirstLaunchIfShown(
  session: Session,
): Promise<void> {
  const opened = await session.waitFor(WELCOME_OR_LIBRARY);
  if ((await opened.text()) !== "Welcome to Omnileaf") {
    return;
  }
  await (await session.waitFor(GET_STARTED)).click();
  for (const step of STEPS) {
    await session.waitFor(headingNamed(step.headings));
    const leave = xpath(
      `//main//button[starts-with(normalize-space(), "${step.leaveWith}")]`,
    );
    await (await session.waitFor(leave)).click();
  }
}

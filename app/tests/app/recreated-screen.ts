import { pollUntil, type Session } from "./webdriver.ts";

const NEW_SCREEN_TIMEOUT_MS = 30_000;

async function newWindow(
  session: Session,
  known: readonly string[],
): Promise<string | undefined> {
  const windows = await session.windows();
  return windows.find((handle) => !known.includes(handle));
}

export async function followRecreatedScreen(
  session: Session,
  recreate: () => Promise<void>,
): Promise<void> {
  const known = await session.windows();
  await recreate();
  const created = await pollUntil(
    () => newWindow(session, known),
    NEW_SCREEN_TIMEOUT_MS,
    "the recreated activity's web view",
  );
  await session.switchToWindow(created);
}

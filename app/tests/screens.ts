export const SCREEN_NAMES = ["phone", "tablet", "desktop"] as const;

export type ScreenName = (typeof SCREEN_NAMES)[number];

const SCREEN_PROJECT = /^(?:chromium|webkit)-(phone|tablet|desktop)$/;

function isScreenName(value: string): value is ScreenName {
  return SCREEN_NAMES.some((name) => name === value);
}

export function screensFromEnvironment(
  value: string | undefined,
): readonly ScreenName[] | null {
  if (value === undefined || value === "") {
    return null;
  }
  const named = value.split(",");
  const unknown = named.some((name) => !isScreenName(name));
  if (unknown) {
    throw new Error(
      `PLAYWRIGHT_SCREENS must list screens from ${SCREEN_NAMES.join(", ")} separated by commas, got ${JSON.stringify(value)}`,
    );
  }
  return SCREEN_NAMES.filter((name) => named.includes(name));
}

export function isOnScreens(
  project: string,
  screens: readonly ScreenName[] | null,
): boolean {
  const [, screen] = SCREEN_PROJECT.exec(project) ?? [];
  return (
    screens === null ||
    screen === undefined ||
    screens.some((name) => name === screen)
  );
}

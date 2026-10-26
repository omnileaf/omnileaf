export const DEFAULT_PREVIEW_PORT = 4173;

const WHOLE_NUMBER = /^\d+$/;
const LOWEST_PORT = 1024;
const HIGHEST_PORT = 65_535;

export function previewPortFromEnvironment(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PREVIEW_PORT;
  }
  const port = Number(value);
  if (!WHOLE_NUMBER.test(value) || port < LOWEST_PORT || port > HIGHEST_PORT) {
    throw new Error(
      `OMNILEAF_PREVIEW_PORT must be a port from ${String(LOWEST_PORT)} to ${String(HIGHEST_PORT)}, got ${JSON.stringify(value)}`,
    );
  }
  return port;
}

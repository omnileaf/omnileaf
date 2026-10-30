import type { ClassValue } from "svelte/elements";

export const WINDOWS_PLAIN_KEY =
  "windows:rounded-none windows:p-none windows:font-regular windows:min-inline-none";

const WINDOWS_KEY_HINT = `${WINDOWS_PLAIN_KEY} windows:bg-transparent windows:text-native-key-ink`;

export function windowsKeyHint(
  callerClasses: ClassValue | null | undefined,
): string {
  return callerClasses === undefined || callerClasses === null
    ? WINDOWS_KEY_HINT
    : "";
}

import {
  type AppLock,
  commands,
  type IpcError,
  type LockAfter,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const NEW_APP_LOCK: AppLock = {
  isOn: false,
  lockAfter: "oneMinute",
};

export const LOCK_DELAYS = [
  "immediately",
  "oneMinute",
  "fiveMinutes",
  "thirtyMinutes",
] as const satisfies readonly LockAfter[];

export const LOCK_DELAY_NAMES = {
  immediately: m.app_lock_immediately,
  oneMinute: m.app_lock_one_minute,
  fiveMinutes: m.app_lock_five_minutes,
  thirtyMinutes: m.app_lock_thirty_minutes,
} satisfies Record<LockAfter, () => string>;

export function appLockSummary(lock: AppLock): string {
  if (!lock.isOn) {
    return m.app_lock_off();
  }
  return lock.lockAfter === "immediately"
    ? m.app_lock_on_immediately()
    : m.app_lock_on_after({ delay: LOCK_DELAY_NAMES[lock.lockAfter]() });
}

export type AppLockReading =
  | { readonly kind: "read"; readonly lock: AppLock }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed"; readonly error: IpcError };

export async function readAppLock(
  readLock: typeof commands.appLock = commands.appLock,
): Promise<AppLockReading> {
  const read = await readLock();
  if (read.status === "ok") {
    return { kind: "read", lock: read.data };
  }
  return read.error.code === "appLockUnavailable"
    ? { kind: "unavailable" }
    : { kind: "failed", error: read.error };
}

export async function rememberLockWords(
  remember: typeof commands.rememberAppLockWords = commands.rememberAppLockWords,
): Promise<void> {
  const remembered = await remember({
    title: m.app_lock_locked_title(),
    body: m.app_lock_locked_body(),
    unlock: m.app_lock_unlock(),
    prompt: m.app_lock_unlock_prompt(),
    turnedOff: m.app_lock_turned_off_no_screen_lock(),
  });
  if (
    remembered.status === "error" &&
    remembered.error.code !== "appLockUnavailable"
  ) {
    reportError(remembered.error);
  }
}

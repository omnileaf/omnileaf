import {
  type AppLock,
  commands,
  type LockAfter,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const NEW_APP_LOCK: AppLock = {
  isOn: false,
  lockAfter: "oneMinute",
  hidesContentInRecents: false,
  canHideContentInRecents: true,
};

export const LOCK_DELAYS = [
  "immediately",
  "oneMinute",
  "fiveMinutes",
  "fifteenMinutes",
  "thirtyMinutes",
  "oneHour",
] as const satisfies readonly LockAfter[];

export const LOCK_DELAY_NAMES = {
  immediately: m.app_lock_immediately,
  oneMinute: m.app_lock_one_minute,
  fiveMinutes: m.app_lock_five_minutes,
  fifteenMinutes: m.app_lock_fifteen_minutes,
  thirtyMinutes: m.app_lock_thirty_minutes,
  oneHour: m.app_lock_one_hour,
} satisfies Record<LockAfter, () => string>;

export function appLockSummary(lock: AppLock): string {
  if (!lock.isOn) {
    return m.app_lock_off();
  }
  return lock.lockAfter === "immediately"
    ? m.app_lock_on_immediately()
    : m.app_lock_on_after({ delay: LOCK_DELAY_NAMES[lock.lockAfter]() });
}

export async function readAppLock(platform: Platform): Promise<AppLock | null> {
  if (platform !== "android") {
    return null;
  }
  const read = await commands.appLock();
  if (read.status === "error") {
    reportError(read.error);
    return null;
  }
  return read.data;
}

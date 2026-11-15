import type { AppLock } from "#lib/ipc/bindings.ts";

export const NEW_APP_LOCK: AppLock = {
  isOn: false,
  lockAfter: "oneMinute",
  hidesContent: false,
  canHideContent: true,
};

import type { Platform, WindowBackdrop } from "#lib/ipc/bindings.ts";

/** Windows 11 draws Mica behind its windows while transparency effects are on, as they are out of the box. */
export function usualWindowBackdrop(platform: Platform): WindowBackdrop {
  return platform === "windows" ? "mica" : "none";
}

import type { Platform } from "../../src/lib/ipc/bindings.ts";

export type PhonePlatform = Extract<Platform, "ios" | "android">;

export function isPhonePlatform(
  platform: Platform | undefined,
): platform is PhonePlatform {
  return platform === "ios" || platform === "android";
}

export function expectPhone(
  platform: Platform | undefined,
): asserts platform is PhonePlatform {
  if (!isPhonePlatform(platform)) {
    throw new Error(
      `Expected a phone project's platform, got ${String(platform)}`,
    );
  }
}

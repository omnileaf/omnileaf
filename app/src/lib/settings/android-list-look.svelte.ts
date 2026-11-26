import { getContext, setContext } from "svelte";

import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

export interface AndroidListLook {
  readonly isOn: boolean;
}

const ANDROID_LIST_LOOK = Symbol("android list look");

export function drawAndroidListsWith(look: AndroidListLook): void {
  setContext(ANDROID_LIST_LOOK, look);
}

export function androidListLook(): AndroidListLook {
  return (
    getContext<AndroidListLook | undefined>(ANDROID_LIST_LOOK) ??
    new AndroidPhone()
  );
}

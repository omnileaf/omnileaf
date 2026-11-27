<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import {
    ANDROID_GUIDE_LOOK,
    IOS_GUIDE_LOOK,
    type NativeGuideLook,
  } from "./folder-guide-looks.ts";
  import FolderGuideDesktop from "./FolderGuideDesktop.svelte";
  import FolderGuideNative from "./FolderGuideNative.svelte";

  let { class: className }: { class?: ClassValue } = $props();

  const android = androidListLook();
  const isIos = currentPlatform() === "ios";
  const nativeLook: NativeGuideLook | undefined = $derived.by(() => {
    if (android.isOn) {
      return ANDROID_GUIDE_LOOK;
    }
    return isIos ? IOS_GUIDE_LOOK : undefined;
  });
</script>

{#if nativeLook === undefined}
  <FolderGuideDesktop class={className} />
{:else}
  <FolderGuideNative look={nativeLook} class={className} />
{/if}

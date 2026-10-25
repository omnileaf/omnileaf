<script lang="ts">
  import { EyeOff } from "@lucide/svelte";

  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 18;

  let {
    onPointer,
    showsHint = true,
  }: { onPointer: boolean; showsHint?: boolean } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isOnPhone = $derived(isPhone(platform, width.current));
</script>

<span
  class={[
    "absolute inset-none flex flex-col items-center justify-center gap-xs text-center",
    isOnPhone
      ? "bg-native-veil text-native-on-veil backdrop-blur-glass"
      : "bg-veil text-foreground",
  ]}
>
  <span
    aria-hidden="true"
    class={[
      "flex items-center justify-center",
      !isOnPhone &&
        "rounded-full bg-card shadow-card-rest block-veil-disc inline-veil-disc",
    ]}
  >
    <EyeOff size={ICON_SIZE} />
  </span>
  <span class="text-detail font-bold">{m.library_adult_mark()}</span>
  {#if showsHint}
    <span aria-hidden="true" class="text-caption @max-cover-show:hidden">
      {onPointer ? m.library_click_to_show() : m.library_tap_to_show()}
    </span>
  {/if}
</span>

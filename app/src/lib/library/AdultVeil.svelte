<script lang="ts">
  import { EyeOff } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 18;

  let {
    onPointer,
    showsHint = true,
  }: { onPointer: boolean; showsHint?: boolean } = $props();
</script>

<span
  class="absolute inset-none flex flex-col items-center justify-center gap-xs bg-veil text-center text-foreground touch:max-medium:bg-native-veil touch:max-medium:text-native-on-veil"
>
  <span
    aria-hidden="true"
    class="flex items-center justify-center rounded-full bg-card shadow-card-rest block-veil-disc inline-veil-disc touch:max-medium:bg-transparent touch:max-medium:shadow-none"
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

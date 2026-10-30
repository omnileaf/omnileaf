<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  const CHEVRON_SIZES = {
    android: 14,
    ios: 14,
    linux: 14,
    macos: 14,
    windows: 12,
  } satisfies Record<Platform, number>;

  let { class: className }: { class?: string } = $props();

  const chevronSize = CHEVRON_SIZES[currentPlatform()];
</script>

<li
  role="presentation"
  aria-hidden="true"
  class={cn("shrink-0 windows:mx-2xs", className)}
>
  <ChevronRight size={chevronSize} class="rtl:-scale-x-100" />
</li>

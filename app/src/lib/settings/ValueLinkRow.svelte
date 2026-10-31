<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  const CHEVRON_SIZE = 18;

  let {
    route,
    label,
    value,
  }: {
    route:
      | "/(app)/settings/general/opens-on"
      | "/(app)/settings/general/language"
      | "/(app)/settings/general/time-format";
    label: string;
    value: string;
  } = $props();
</script>

<a
  href={resolve(route)}
  class="flex items-center gap-md ps-lg pe-md text-native-row-title/native-row-title transition-control min-block-native-row active:bg-native-row-pressed"
>
  <span class="flex-1">{label}</span>
  <span class="text-muted">{value}</span>
  <ChevronRight
    size={CHEVRON_SIZE}
    class="shrink-0 text-muted rtl:-scale-x-100"
  />
</a>

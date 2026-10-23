<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import type { IconName } from "#lib/icons/names.ts";

  let {
    name,
    filled = false,
    class: className,
  }: { name: IconName; filled?: boolean; class?: string } = $props();
</script>

<span
  data-icon={name}
  data-filled={filled ? "" : undefined}
  aria-hidden="true"
  class={cn("block-native-icon inline-native-icon", className)}
></span>

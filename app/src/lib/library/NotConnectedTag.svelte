<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const TAG_ICON_SIZE = 12;

  const LOOKS = {
    outlined: "ring-1 ring-control-edge ring-inset",
    filled: "bg-background",
  } as const;

  let {
    look = "outlined",
    class: className,
  }: { look?: keyof typeof LOOKS; class?: ClassValue } = $props();
</script>

<span
  data-slot="not-connected-tag"
  class={[
    "inline-flex shrink-0 items-center gap-xs rounded-full px-sm py-2xs text-caption font-semibold whitespace-nowrap text-danger",
    LOOKS[look],
    className,
  ]}
>
  <Icon name="unplug" size={TAG_ICON_SIZE} />
  {m.library_not_connected()}
</span>

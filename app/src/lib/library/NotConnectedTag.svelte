<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const TAG_ICON_SIZE = 12;

  let { class: className }: { class?: ClassValue } = $props();
</script>

<span
  data-slot="not-connected-tag"
  class={[
    "inline-flex shrink-0 items-center gap-xs rounded-full px-sm py-2xs text-caption font-semibold whitespace-nowrap text-danger ring-1 ring-control-edge ring-inset",
    className,
  ]}
>
  <Icon name="unplug" size={TAG_ICON_SIZE} />
  {m.library_not_connected()}
</span>

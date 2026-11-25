<script lang="ts">
  import { ExternalLink } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { WayRowProps } from "./report-row-props.ts";
  import { ICON_TILE, TILE_ICON_SIZE } from "./report-rows-look.ts";

  let { icon: Icon, label, opensBrowser, onPress }: WayRowProps = $props();
</script>

<Button
  type="button"
  look="row"
  class={[
    "gap-md px-lg py-md inline-full min-block-touch-target",
    ROW_FOCUS_RING,
  ]}
  onclick={onPress}
>
  <span aria-hidden="true" class={ICON_TILE}>
    <Icon size={TILE_ICON_SIZE} />
  </span>
  <span class="flex-1 font-medium expanded:font-semibold">{label}</span>
  {#if opensBrowser}
    <ExternalLink
      role="img"
      aria-label={m.about_opens_in_browser()}
      size={TILE_ICON_SIZE}
      class="shrink-0 text-muted"
    />
  {/if}
</Button>

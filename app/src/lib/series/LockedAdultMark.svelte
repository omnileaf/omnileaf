<script lang="ts">
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import RatedAdultNote from "./RatedAdultNote.svelte";

  const LINK =
    "rounded-link text-foreground underline decoration-foreground/40 underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  const id = $props.id();
</script>

<div class="flex items-center gap-md py-md min-block-touch-target">
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class="font-medium expanded:font-semibold">
      {m.edit_details_mark_adult()}
    </span>
    <span id="{id}-description" class="text-detail text-muted">
      <RatedAdultNote linkClass={LINK} />
    </span>
  </span>
  <Switch
    checked
    disabled
    aria-labelledby="{id}-label"
    aria-describedby="{id}-description"
    class="disabled:cursor-not-allowed disabled:opacity-50"
  />
</div>

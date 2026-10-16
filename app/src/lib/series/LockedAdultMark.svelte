<script lang="ts">
  import { resolve } from "$app/paths";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const LINK_SPOT = "\u0000";

  const id = $props.id();
  const [before = "", after = ""] = m
    .edit_details_mark_adult_rated({ link: LINK_SPOT })
    .split(LINK_SPOT);
</script>

<div class="flex items-center gap-md py-md min-block-touch-target">
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class="font-medium expanded:font-semibold">
      {m.edit_details_mark_adult()}
    </span>
    <span id="{id}-description" class="text-detail text-muted">
      {before}<a
        href={resolve("/(app)/settings/library/adult-content")}
        class="rounded-link text-foreground underline decoration-foreground/40 underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >{m.edit_details_settings_library()}</a
      >{after}
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

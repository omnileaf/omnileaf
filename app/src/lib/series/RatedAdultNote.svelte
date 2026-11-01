<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { resolve } from "$app/paths";
  import { m } from "#lib/paraglide/messages.js";

  const LINK_SPOT = "\u0000";

  let { linkClass }: { linkClass: ClassValue } = $props();

  const [before = "", after = ""] = m
    .edit_details_mark_adult_rated({ link: LINK_SPOT })
    .split(LINK_SPOT);
</script>

{before}<a
  href={resolve("/(app)/settings/library/adult-content")}
  class={linkClass}>{m.edit_details_settings_library()}</a
>{after}

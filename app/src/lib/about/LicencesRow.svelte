<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "#lib/paraglide/messages.js";

  import { type AboutLook, ROW_ICON_SIZES, ROW_LOOKS } from "./look";
  import RowText from "./RowText.svelte";

  let { look }: { look: AboutLook } = $props();
</script>

<li>
  <a href={resolve("/(app)/settings/about/licences")} class={ROW_LOOKS[look]}>
    <RowText label={m.about_licences()} hint={m.about_licences_hint()} {look} />
    <ChevronRight
      size={ROW_ICON_SIZES[look]}
      class="shrink-0 text-muted rtl:-scale-x-100"
    />
  </a>
</li>

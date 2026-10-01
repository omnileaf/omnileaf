<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.settings_title()}</h1>
<ul class="mbs-xl rounded-card border border-border bg-card">
  <li>
    <a
      href={resolve("/settings/about")}
      class="flex items-center justify-between px-lg min-block-touch-target"
    >
      {m.about_title()}
      <ChevronRight size={20} class="text-muted" />
    </a>
  </li>
</ul>

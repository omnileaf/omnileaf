<script lang="ts">
  import ThemeChoice from "$lib/appearance/ThemeChoice.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.appearance_title()}</h1>
<div class="mbs-xl">
  <ThemeChoice legend={m.appearance_light_or_dark()} />
</div>

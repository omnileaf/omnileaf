<script lang="ts">
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.history_title()} />
<section class="mbs-2xl">
  <h2 class="text-title font-bold">{m.history_empty_title()}</h2>
  <p class="mbs-sm text-muted">{m.history_empty_body()}</p>
</section>

<script lang="ts">
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.browse_title()} />
<section class="mbs-2xl">
  <h2 class="text-title font-bold">{m.browse_empty_title()}</h2>
  <p class="mbs-sm text-muted">{m.browse_empty_body()}</p>
  <p class="mbs-sm text-muted">{m.browse_empty_later()}</p>
</section>

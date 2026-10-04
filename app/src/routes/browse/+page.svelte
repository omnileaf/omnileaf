<script lang="ts">
  import { Compass } from "@lucide/svelte";

  import EmptyState from "$lib/page/EmptyState.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.browse_title()} />
<EmptyState
  icon={Compass}
  title={m.browse_empty_title()}
  body={m.browse_empty_body()}
>
  <p class="text-footnote text-muted">{m.browse_empty_later()}</p>
</EmptyState>

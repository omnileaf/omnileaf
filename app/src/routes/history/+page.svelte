<script lang="ts">
  import { RotateCcwClock } from "@lucide/svelte";

  import EmptyState from "$lib/page/EmptyState.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.history_title()} />
<EmptyState
  icon={RotateCcwClock}
  title={m.history_empty_title()}
  body={m.history_empty_body()}
/>

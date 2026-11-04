<script lang="ts">
  import { formatReceived } from "#lib/received.ts";

  let { at }: { at: number } = $props();

  const moment = $derived(formatReceived(at));
</script>

<time datetime={moment.iso} class="tabular-nums">{moment.text}</time>

<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  let { name }: { name: string } = $props();

  const CHEVRON_SIZE = 16;
</script>

<a
  href={resolve("/(app)/creator/[name]", { name: encodeURIComponent(name) })}
  class="inline-flex items-center gap-2xs rounded-control hover:underline focus-visible:focus-ring"
>
  {name}
  <ChevronRight size={CHEVRON_SIZE} aria-hidden="true" class="text-muted" />
</a>

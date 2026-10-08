<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import iconUrl from "#branding/icon.svg?url";

  let { class: className }: { class?: ClassValue } = $props();
</script>

<img src={iconUrl} alt="" class={className} />

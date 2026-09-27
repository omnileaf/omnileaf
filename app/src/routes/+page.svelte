<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<main class="p-xl">
  <h1 class="text-headline font-bold">{m.library_title()}</h1>
  <p class="mbs-sm text-muted">{m.library_empty()}</p>
  <p class="mbs-xl text-caption text-muted">
    {m.app_version({ version: data.appInfo.version })}
  </p>
</main>

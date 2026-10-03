<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.about_title()}</h1>
<section class="mbs-xl rounded-card border border-border bg-card p-lg">
  <h2 class="text-title font-bold">{m.app_name()}</h2>
  <p class="mbs-xs text-muted">
    {m.app_version({ version: data.appInfo.version })}
  </p>
</section>
<p class="mbs-lg text-caption text-muted">{m.about_licence()}</p>

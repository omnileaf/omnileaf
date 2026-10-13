<script lang="ts">
  import "../app.css";

  import type { Snippet } from "svelte";

  import iconUrl from "#branding/icon.svg?url";
  import { SECURITY_TXT_PATH, SOURCE_URL } from "#lib/links.ts";

  let { children }: { children: Snippet } = $props();

  const year = new Date().getUTCFullYear();
</script>

<svelte:head>
  <link rel="icon" href={iconUrl} type="image/svg+xml" />
</svelte:head>

<header
  class="mx-auto flex flex-wrap items-center justify-between gap-4 p-6 max-inline-page"
>
  <a href="/" class="flex items-center gap-3 text-foreground no-underline">
    <img src={iconUrl} alt="" class="block-10 inline-10" />
    <span
      class="font-display text-title font-bold tracking-tight text-foreground"
      >Omnileaf</span
    >
  </a>
  <nav aria-label="Main" class="flex flex-wrap gap-1">
    <a
      href="/#security"
      class="inline-flex items-center rounded-control px-3.5 font-medium text-foreground no-underline min-block-11"
      >Security</a
    >
    <a
      href={SOURCE_URL}
      class="inline-flex items-center rounded-control px-3.5 font-medium text-foreground no-underline min-block-11"
      >GitHub</a
    >
  </nav>
</header>

{@render children()}

<footer class="border-bs border-border">
  <div
    class="mx-auto flex flex-wrap justify-between gap-4 px-6 pbs-8 pbe-10 text-small text-muted max-inline-page"
  >
    <span>© {year} Omnileaf Pty Ltd</span>
    <div class="flex flex-wrap gap-5">
      <a href={SOURCE_URL} class="text-muted">Source on GitHub</a>
      <span>Licence GPL-3.0-only</span>
      <a href={SECURITY_TXT_PATH} class="text-muted">security.txt</a>
    </div>
  </div>
</footer>

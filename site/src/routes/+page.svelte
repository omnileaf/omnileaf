<script lang="ts">
  import { SOURCE_URL } from "#lib/links.ts";

  const TAGLINE = "Open-source reader for manga, comics and books";
</script>

<svelte:head>
  <title>Omnileaf: {TAGLINE.toLowerCase()}</title>
  <meta
    name="description"
    content="{TAGLINE}, for Windows, macOS, Linux, Android and iOS. In early development."
  />
</svelte:head>

<main>
  <section
    class="mx-auto flex flex-wrap items-center gap-12 px-6 pbs-12 pbe-18 max-inline-page"
  >
    <div class="flex grow basis-110 flex-col gap-6 min-inline-0">
      <span
        class="self-start rounded-full bg-accent-soft px-3 py-1.5 text-small font-semibold text-accent-ink"
        >Coming soon · in early development</span
      >
      <h1 class="m-0 font-display text-hero font-bold tracking-tight">
        {TAGLINE}.
      </h1>
      <p class="m-0 text-lead text-muted max-inline-prose">
        One fast app for Windows, macOS, Linux, Android and iOS, built on a Rust
        core. It reads your own files and servers, keeps your place in sync
        across devices, and works offline. There is no release yet.
      </p>
      <div class="flex flex-wrap gap-3">
        <a
          href={SOURCE_URL}
          class="inline-flex items-center rounded-control bg-accent px-5.5 font-semibold text-on-accent no-underline min-block-12"
          >Follow on GitHub</a
        >
      </div>
    </div>
  </section>
</main>

<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<svelte:head>
  <title>Page not found · Omnileaf</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="mx-auto flex flex-col items-start gap-6 px-6 pbs-12 pbe-18 max-inline-page"
>
  <h1 class="m-0 font-display text-heading font-bold">Page not found</h1>
  <p class="m-0 text-lead text-muted">There is nothing at this address.</p>
  <a
    href={resolve("/")}
    class="inline-flex items-center rounded-control bg-accent px-5.5 font-semibold text-on-accent no-underline min-block-12"
    >Go to the home page</a
  >
</main>

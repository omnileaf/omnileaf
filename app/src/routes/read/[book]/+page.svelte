<script lang="ts">
  import { onMount } from "svelte";

  import { resolve } from "$app/paths";
  import { commands } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getBookPresence } from "#lib/reader/book-presence.svelte.ts";
  import PagedReader from "#lib/reader/PagedReader.svelte";
  import { allowPinchZoom } from "#lib/reader/pinch-zoom.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const shown = $derived(data.shown);
  const bookPresence = getBookPresence();

  $effect(() => {
    bookPresence.isOpen = shown.kind === "found";
  });

  onMount(() => {
    void commands.orientScreen("followDevice");
    const lockScale = allowPinchZoom();
    return () => {
      bookPresence.isOpen = false;
      lockScale();
      void commands.orientScreen("portraitOnPhones");
      void commands.changeFullScreen("leave");
    };
  });
</script>

{#if shown.kind === "found"}
  {#key shown.book.id}
    <PagedReader book={shown.book} />
  {/key}
{:else}
  <main
    class="flex flex-col gap-lg p-xl ps-page-start pe-page-end pbs-page-top"
  >
    <a
      href={resolve("/(app)")}
      class="self-start text-small font-semibold text-accent"
    >
      {m.reader_back_label()}
    </a>
    <div class="flex flex-col gap-sm">
      {#if shown.kind === "missing"}
        <h1 tabindex="-1" class="text-headline font-bold">
          {m.reader_not_found()}
        </h1>
        <p class="text-body text-muted">{m.reader_not_found_body()}</p>
      {:else if shown.kind === "unreadable"}
        <h1 tabindex="-1" class="text-headline font-bold">
          {m.reader_unreadable()}
        </h1>
        <p class="text-body text-muted">{m.reader_unreadable_body()}</p>
      {:else}
        <h1 tabindex="-1" class="text-headline font-bold">
          {m.library_title()}
        </h1>
        <p class="text-body text-muted">{m.reader_failed()}</p>
      {/if}
    </div>
  </main>
{/if}

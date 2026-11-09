<script lang="ts">
  import { FileText, TriangleAlert } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { CHOICE_ROW } from "./choice-row.ts";
  import { ComicViewerChoice } from "./default-viewer.svelte.ts";
  import { usesSetupPages } from "./setup-pages.ts";

  const ICON_SIZE = 20;

  const platform = currentPlatform();
  const isSetupRow = usesSetupPages(platform);
  const choice = new ComicViewerChoice({
    read: commands.comicFilesDefaultViewer,
    make: commands.makeOmnileafTheComicViewer,
  });
  const help = $derived(
    platform === "windows"
      ? m.first_launch_choices_open_files_windows_help()
      : m.first_launch_choices_open_files_help(),
  );
  const headingId = $props.id();
  const helpId = `${headingId}-help`;
  const failedId = `${headingId}-failed`;

  function turnOn(isOn: boolean): void {
    if (isOn) {
      void choice.turnOn();
    }
  }

  onMount(() => {
    void choice.load();
  });
</script>

<section
  aria-labelledby={headingId}
  class={isSetupRow ? CHOICE_ROW.section : "flex flex-col gap-sm"}
>
  {#if isSetupRow}
    <FileText size={ICON_SIZE} aria-hidden="true" class={CHOICE_ROW.icon} />
  {/if}
  <h2
    id={headingId}
    class={isSetupRow
      ? CHOICE_ROW.title
      : "font-semibold desktop:text-footnote desktop:text-muted"}
  >
    {m.first_launch_choices_open_files()}
  </h2>
  <p
    id={helpId}
    class={isSetupRow ? CHOICE_ROW.hint : "text-footnote text-muted"}
  >
    {help}
  </p>
  <Switch
    bind:checked={() => choice.isOn, turnOn}
    disabled={choice.isOn}
    aria-labelledby={headingId}
    aria-describedby={choice.failed ? `${helpId} ${failedId}` : helpId}
    class={isSetupRow
      ? "col-start-3 row-span-2 row-start-1 justify-self-end"
      : "self-start"}
  />
  {#if choice.failed}
    <p
      id={failedId}
      role="alert"
      class="col-span-3 flex items-center gap-xs text-footnote text-danger"
    >
      <TriangleAlert size={16} aria-hidden="true" />
      {m.first_launch_choices_open_files_failed()}
    </p>
  {/if}
</section>

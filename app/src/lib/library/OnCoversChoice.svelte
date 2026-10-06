<script lang="ts">
  import type { OnCovers } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import SwitchTrack from "./SwitchTrack.svelte";

  interface Choice {
    readonly name: keyof OnCovers;
    readonly label: () => string;
  }

  const CHOICES: readonly Choice[] = [
    { name: "showsUnreadCount", label: m.library_on_covers_unread_count },
    { name: "showsDownloaded", label: m.library_on_covers_downloaded },
    { name: "showsLanguage", label: m.library_on_covers_language },
    {
      name: "showsReadingProgress",
      label: m.library_on_covers_reading_progress,
    },
    {
      name: "showsContinueButton",
      label: m.library_on_covers_continue_button,
    },
  ];

  let {
    onCovers,
    onChoose,
  }: {
    onCovers: OnCovers;
    onChoose: (name: keyof OnCovers, isShown: boolean) => void;
  } = $props();

  const headingId = $props.id();
</script>

<div
  role="group"
  aria-labelledby={headingId}
  class="flex flex-col large:gap-2xs large:border-bs large:border-border large:pbs-md"
>
  <p
    id={headingId}
    class="mbe-2xs text-detail font-semibold text-muted large:mbe-xs large:text-caption"
  >
    {m.library_on_covers()}
  </p>
  {#each CHOICES as choice (choice.name)}
    <label
      class="flex items-center gap-md text-body min-block-touch-target large:gap-label large:text-small large:min-block-checkbox-row"
    >
      <input
        type="checkbox"
        class="peer sr-only large:not-sr-only large:order-first large:m-none large:shrink-0 large:accent-accent large:block-lg large:inline-lg"
        checked={onCovers[choice.name]}
        onchange={(event) => {
          onChoose(choice.name, event.currentTarget.checked);
        }}
      />
      <span class="flex-1">{choice.label()}</span>
      <SwitchTrack class="large:hidden" />
    </label>
  {/each}
</div>

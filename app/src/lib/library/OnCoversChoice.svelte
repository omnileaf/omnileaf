<script lang="ts">
  import type { OnCovers } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import SwitchLookCheckbox from "./SwitchLookCheckbox.svelte";

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
      <SwitchLookCheckbox
        bind:checked={
          () => onCovers[choice.name],
          (isShown: boolean) => {
            onChoose(choice.name, isShown);
          }
        }
      />
      <span class="flex-1">{choice.label()}</span>
    </label>
  {/each}
</div>

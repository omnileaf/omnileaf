<script lang="ts">
  import type { OnCovers } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ViewSwitchRow from "./ViewSwitchRow.svelte";

  interface Choice {
    readonly name: keyof OnCovers;
    readonly label: () => string;
  }

  const CHOICES: readonly Choice[] = [
    { name: "showsUnreadCount", label: m.library_on_covers_unread_count },
    { name: "showsLanguage", label: m.library_on_covers_language },
    {
      name: "showsReadingProgress",
      label: m.library_on_covers_reading_progress,
    },
    { name: "showsDownloaded", label: m.library_on_covers_downloaded },
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

<section role="group" aria-labelledby={headingId} class="flex flex-col">
  <h3 id={headingId} class="pbs-xl text-small font-semibold">
    {m.library_on_covers()}
  </h3>
  <div class="flex flex-col divide-y divide-border">
    {#each CHOICES as choice (choice.name)}
      <ViewSwitchRow
        label={choice.label()}
        isOn={onCovers[choice.name]}
        onToggle={(isShown: boolean) => {
          onChoose(choice.name, isShown);
        }}
      />
    {/each}
  </div>
</section>
